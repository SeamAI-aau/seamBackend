import { Injectable, Inject } from '@nestjs/common';
import axios, { type AxiosResponse } from 'axios';
import { TaskStatus } from '@prisma/client';
import { JiraService } from './jira.service';
import { TASK_REPOSITORY } from '../../tasks/task-tokens';
import type { ITaskRepository } from '../../tasks/task.repository';
import type { JiraCreateIssueResponse } from './types/jira-api.types';

const JIRA_API_ISSUE_PATH = '/rest/api/3/issue';

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
   */
  async syncTaskToJira(taskId: string): Promise<void> {
    const task = await this.taskRepo.findByIdWithProject(taskId);

    if (!task) return;
    if (task.jiraIssueKey) return;
    if (task.status !== TaskStatus.APPROVED) return;

    const ownerId = task.meeting.project.ownerId;
    const projectKey = task.meeting.project.jiraProjectKey;

    if (!projectKey?.trim()) {
      throw new Error(
        `Project ${task.meeting.project.id} has no Jira project key configured`,
      );
    }

    const { accessToken, cloudId } = await this.jiraService.getValidAccessToken(ownerId);

    const url = `https://api.atlassian.com/ex/jira/${cloudId}${JIRA_API_ISSUE_PATH}`;

    const response: AxiosResponse<JiraCreateIssueResponse> = await axios.post(
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
  }
}
