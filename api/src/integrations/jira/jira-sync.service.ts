import { Injectable, Inject, Logger } from '@nestjs/common';
import axios, { isAxiosError } from 'axios';
import { UnrecoverableError } from 'bullmq';
import { JiraProposalAction, TaskStatus } from '@prisma/client';
import { JiraService } from './jira.service';
import { JiraIssueService } from './jira-issue.service';
import { AppException } from '../../common/errors/app.exception';
import { TASK_REPOSITORY } from '../../tasks/types/task.tokens';
import type { ITaskRepository } from '../../tasks/types/task.repository';
import type { JiraCreateIssueResponse } from './types/jira-api.types';

const JIRA_API_ISSUE_PATH = '/rest/api/3/issue';
const MAX_ERROR_LEN = 8000;

function formatJiraApiError(err: unknown): string {
  if (isAxiosError(err)) {
    const data = err.response?.data;
    if (data && typeof data === 'object') {
      const msgs = (data as { errorMessages?: string[] }).errorMessages;
      if (msgs?.length) {
        return msgs.join('; ').slice(0, MAX_ERROR_LEN);
      }
      const errors = (data as { errors?: Record<string, unknown> }).errors;
      if (errors && typeof errors === 'object') {
        return JSON.stringify(errors).slice(0, MAX_ERROR_LEN);
      }
    }
    const status = err.response?.status;
    const tail = typeof err.response?.data === 'string' ? err.response.data.slice(0, 500) : '';
    return `HTTP ${status ?? '?'} ${err.message}${tail ? ` — ${tail}` : ''}`.slice(0, MAX_ERROR_LEN);
  }
  if (err instanceof Error) {
    return err.message.slice(0, MAX_ERROR_LEN);
  }
  return String(err).slice(0, MAX_ERROR_LEN);
}

function httpStatus(err: unknown): number | undefined {
  return isAxiosError(err) ? err.response?.status : undefined;
}

@Injectable()
export class JiraSyncService {
  private readonly logger = new Logger(JiraSyncService.name);

  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly taskRepo: ITaskRepository,
    private readonly jiraService: JiraService,
    private readonly jiraIssueService: JiraIssueService,
  ) {}

  /**
   * Sync a single task to Jira: create an issue and mark task as SYNCED.
   * Idempotent: no-op if task already has jiraIssueKey or status is not APPROVED.
   *
   * Failures persist `jiraSyncLastError` on the task for SM visibility.
   * Uses BullMQ `UnrecoverableError` for non-retryable cases (missing config, HTTP 400/404).
   */
  async syncTaskToJira(taskId: string): Promise<void> {
    this.logger.log(`[jira-sync] sync start taskId=${taskId}`);
    const task = await this.taskRepo.findByIdWithProject(taskId);

    if (!task) {
      this.logger.warn(`[jira-sync] sync skip taskId=${taskId} reason=task_not_found`);
      return;
    }
    if (task.jiraIssueKey) {
      this.logger.log(
        `[jira-sync] sync skip taskId=${taskId} reason=already_synced jiraIssueKey=${task.jiraIssueKey}`,
      );
      return;
    }
    if (task.status !== TaskStatus.APPROVED) {
      this.logger.warn(
        `[jira-sync] sync skip taskId=${taskId} reason=status_not_approved status=${task.status}`,
      );
      return;
    }

    const projectId = task.project.id;
    const ownerId = task.project.ownerId;
    const projectKey = task.project.jiraProjectKey;

    if (!projectKey?.trim()) {
      const msg = `Project ${projectId} has no Jira project key configured`;
      this.logger.warn(`[jira-sync] sync fail taskId=${taskId} reason=no_project_key projectId=${projectId}`);
      await this.taskRepo.setJiraSyncLastError(taskId, msg);
      throw new UnrecoverableError(msg);
    }

    if (
      task.jiraProposalAction === JiraProposalAction.TRANSITION &&
      task.jiraProposalIssueKey?.trim()
    ) {
      this.logger.log(
        `[jira-sync] sync transition taskId=${taskId} issueKey=${task.jiraProposalIssueKey.trim()}`,
      );
      await this.syncApprovedTransition(taskId, projectId, ownerId, task);
      return;
    }

    this.logger.log(
      `[jira-sync] sync create taskId=${taskId} projectId=${projectId} projectKey=${projectKey} ownerId=${ownerId}`,
    );

    let accessToken: string;
    let cloudId: string;
    try {
      const tokens = await this.jiraService.getValidAccessToken(ownerId);
      accessToken = tokens.accessToken;
      cloudId = tokens.cloudId;
      this.logger.log(`[jira-sync] token ok taskId=${taskId} cloudId=${cloudId}`);
    } catch (err) {
      const msg = formatJiraApiError(err);
      this.logger.warn(`[jira-sync] token fail taskId=${taskId}: ${msg}`);
      await this.taskRepo.setJiraSyncLastError(taskId, msg);
      throw err;
    }

    const url = `https://api.atlassian.com/ex/jira/${cloudId}${JIRA_API_ISSUE_PATH}`;

    try {
      const descriptionAdf = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: task.description || 'No description provided.',
              },
            ],
          },
        ],
      };

      const response = await axios.post<JiraCreateIssueResponse>(
        url,
        {
          fields: {
            project: { key: projectKey },
            summary: task.title,
            description: descriptionAdf,
            issuetype: { name: 'Task' },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        },
      );

      const issueKey = response.data.key;
      await this.taskRepo.markAsCreatedInJira(taskId, issueKey);
      this.logger.log(`[jira-sync] sync success taskId=${taskId} jiraIssueKey=${issueKey}`);
    } catch (err) {
      const msg = formatJiraApiError(err);
      const status = httpStatus(err);
      this.logger.warn(
        `[jira-sync] create fail taskId=${taskId} httpStatus=${status ?? 'n/a'}: ${msg}`,
      );
      await this.taskRepo.setJiraSyncLastError(taskId, msg);
      if (status === 400 || status === 404) {
        throw new UnrecoverableError(msg);
      }
      throw err;
    }
  }

  private async syncApprovedTransition(
    taskId: string,
    projectId: string,
    ownerId: string,
    task: {
      jiraProposalIssueKey: string | null;
      jiraProposalTransitionId: string | null;
      jiraProposalTargetStatus: string | null;
    },
  ): Promise<void> {
    const issueKey = task.jiraProposalIssueKey!.trim().toUpperCase();

    try {
      const { transitions } = await this.jiraIssueService.getTransitions(
        projectId,
        issueKey,
        ownerId,
      );
      const transitionId = this.jiraIssueService.resolveTransitionId(
        transitions,
        task.jiraProposalTransitionId,
        task.jiraProposalTargetStatus,
      );
      await this.jiraIssueService.transitionIssue(projectId, issueKey, transitionId, ownerId);
      await this.taskRepo.markAsCreatedInJira(taskId, issueKey);
      this.logger.log(
        `[jira-sync] transition success taskId=${taskId} jiraIssueKey=${issueKey}`,
      );
    } catch (err) {
      const msg =
        err instanceof AppException ? err.message : formatJiraApiError(err);
      this.logger.warn(`[jira-sync] transition fail taskId=${taskId}: ${msg}`);
      await this.taskRepo.setJiraSyncLastError(taskId, msg);
      if (err instanceof UnrecoverableError) throw err;
      if (err instanceof AppException && err.getStatus() < 500) {
        throw new UnrecoverableError(msg);
      }
      const status = httpStatus(err);
      if (status === 400 || status === 404) {
        throw new UnrecoverableError(msg);
      }
      throw err;
    }
  }
}
