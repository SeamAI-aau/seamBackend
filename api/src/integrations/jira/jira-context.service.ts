import { Injectable, Inject } from '@nestjs/common';
import axios, { isAxiosError } from 'axios';
import { JiraService } from './jira.service';
import type { IProjectRepository } from '../../project/types/project.repository';
import { PROJECT_REPOSITORY } from '../../project/types/project.tokens';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';

const DEFAULT_MAX_ISSUES = 100;

export interface JiraContextTaskDto {
  task_id: string;
  title: string;
  current_status: string;
  priority?: string | null;
  assigneeAccountId?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
}

export interface JiraBoardContextResponse {
  tasks: JiraContextTaskDto[];
  statuses: string[];
}

interface JiraSearchIssue {
  key: string;
  fields?: {
    summary?: string;
    status?: { name?: string };
    priority?: { name?: string };
    assignee?: { accountId?: string };
    updated?: string;
    created?: string;
  };
}

@Injectable()
export class JiraContextService {
  constructor(
    private readonly jiraService: JiraService,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: IProjectRepository,
  ) {}

  /**
   * Board context for ai-engine reconciliation (`JIRA_CONTEXT_URL`).
   * Uses project owner OAuth token and linked jiraProjectKey.
   */
  async getBoardContext(projectId: string): Promise<JiraBoardContextResponse> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
    }

    const projectKey = project.jiraProjectKey?.trim();
    if (!projectKey) {
      return { tasks: [], statuses: [] };
    }

    let accessToken: string;
    let cloudId: string;
    try {
      const tokens = await this.jiraService.getValidAccessToken(project.ownerId);
      accessToken = tokens.accessToken;
      cloudId = tokens.cloudId;
    } catch {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Project owner has not connected Jira',
        400,
      );
    }

    const base = this.jiraService.getApiBaseUrl(cloudId);
    const jql = `project = ${projectKey} ORDER BY updated DESC`;

    try {
      const searchRes = await axios.get<{ issues?: JiraSearchIssue[] }>(`${base}/search`, {
        params: {
          jql,
          maxResults: DEFAULT_MAX_ISSUES,
          fields: 'summary,status,priority,assignee,updated,created',
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      const issues = searchRes.data.issues ?? [];
      const statusSet = new Set<string>();
      const tasks: JiraContextTaskDto[] = [];

      for (const issue of issues) {
        const statusName = issue.fields?.status?.name ?? '';
        if (statusName) statusSet.add(statusName);
        tasks.push({
          task_id: issue.key,
          title: issue.fields?.summary ?? issue.key,
          current_status: statusName,
          priority: issue.fields?.priority?.name ?? null,
          assigneeAccountId: issue.fields?.assignee?.accountId ?? null,
          updatedAt: issue.fields?.updated ?? null,
          createdAt: issue.fields?.created ?? null,
        });
      }

      return {
        tasks,
        statuses: [...statusSet],
      };
    } catch (err) {
      if (isAxiosError(err)) {
        const status = err.response?.status ?? 502;
        const data = err.response?.data;
        let message = 'Failed to load Jira board context';
        if (data && typeof data === 'object') {
          const msgs = (data as { errorMessages?: string[] }).errorMessages;
          if (msgs?.length) message = msgs.join('; ');
        }
        throw new AppException(ErrorCode.VALIDATION_ERROR, message, status >= 500 ? 502 : 400);
      }
      throw err;
    }
  }
}
