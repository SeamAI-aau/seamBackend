import { Injectable, Inject } from '@nestjs/common';
import axios, { isAxiosError } from 'axios';
import { UnrecoverableError } from 'bullmq';
import { TaskStatus } from '@prisma/client';
import { JiraService } from './jira.service';
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
  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly taskRepo: ITaskRepository,
    private readonly jiraService: JiraService,
  ) {}

  /**
   * Sync a single task to Jira: create an issue and mark task as SYNCED.
   * Idempotent: no-op if task already has jiraIssueKey or status is not APPROVED.
   *
   * Failures persist `jiraSyncLastError` on the task for SM visibility.
   * Uses BullMQ `UnrecoverableError` for non-retryable cases (missing config, HTTP 400/404).
   */
  async syncTaskToJira(taskId: string): Promise<void> {
    const task = await this.taskRepo.findByIdWithProject(taskId);

    if (!task) return;
    if (task.jiraIssueKey) return;
    if (task.status !== TaskStatus.APPROVED) return;

    const ownerId = task.meeting.project.ownerId;
    const projectKey = task.meeting.project.jiraProjectKey;

    if (!projectKey?.trim()) {
      const msg = `Project ${task.meeting.project.id} has no Jira project key configured`;
      await this.taskRepo.setJiraSyncLastError(taskId, msg);
      throw new UnrecoverableError(msg);
    }

    let accessToken: string;
    let cloudId: string;
    try {
      const tokens = await this.jiraService.getValidAccessToken(ownerId);
      accessToken = tokens.accessToken;
      cloudId = tokens.cloudId;
    } catch (err) {
      const msg = formatJiraApiError(err);
      await this.taskRepo.setJiraSyncLastError(taskId, msg);
      throw err;
    }

    const url = `https://api.atlassian.com/ex/jira/${cloudId}${JIRA_API_ISSUE_PATH}`;

    try {
      const response = await axios.post<JiraCreateIssueResponse>(
        url,
        {
          fields: {
            project: { key: projectKey },
            summary: task.title,
            description: task.description ?? '',
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
    } catch (err) {
      const msg = formatJiraApiError(err);
      await this.taskRepo.setJiraSyncLastError(taskId, msg);
      const status = httpStatus(err);
      if (status === 400 || status === 404) {
        throw new UnrecoverableError(msg);
      }
      throw err;
    }
  }
}
