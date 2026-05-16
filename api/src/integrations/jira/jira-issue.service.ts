import { Injectable, Inject } from '@nestjs/common';
import axios, { isAxiosError } from 'axios';
import { JiraService } from './jira.service';
import type { IProjectRepository } from '../../project/types/project.repository';
import { PROJECT_REPOSITORY } from '../../project/types/project.tokens';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { JiraTransition, JiraTransitionsResponse } from './types/jira-myself.types';

@Injectable()
export class JiraIssueService {
  constructor(
    private readonly jiraService: JiraService,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: IProjectRepository,
  ) {}

  async getTransitions(
    projectId: string,
    issueKey: string,
    callerUserId: string,
  ): Promise<JiraTransitionsResponse> {
    await this.ensureProjectAccess(projectId, callerUserId);
    const { accessToken, cloudId } = await this.getOwnerTokens(projectId);
    const base = this.jiraService.getApiBaseUrl(cloudId);
    const key = issueKey.trim().toUpperCase();

    try {
      const res = await axios.get<JiraTransitionsResponse>(
        `${base}/issue/${encodeURIComponent(key)}/transitions`,
        {
          params: { expand: 'transitions.fields' },
          headers: this.authHeaders(accessToken),
        },
      );
      return { transitions: res.data.transitions ?? [] };
    } catch (err) {
      throw this.toAppException(err, 'Failed to load Jira transitions');
    }
  }

  /**
   * Picks a workflow transition id: explicit id wins, else match target status name on `to.name`.
   */
  resolveTransitionId(
    transitions: JiraTransition[],
    transitionId: string | null | undefined,
    targetStatusName: string | null | undefined,
  ): string {
    const explicit = transitionId?.trim();
    if (explicit) return explicit;

    const target = targetStatusName?.trim().toLowerCase();
    if (!target) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'transitionId or jiraProposalTargetStatus is required',
        400,
      );
    }

    const match = transitions.find(
      (t) =>
        t.to?.name?.toLowerCase() === target ||
        t.name?.toLowerCase() === target,
    );
    if (!match?.id) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        `No Jira transition found for target status "${targetStatusName}"`,
        400,
      );
    }
    return match.id;
  }

  async transitionIssue(
    projectId: string,
    issueKey: string,
    transitionId: string,
    callerUserId: string,
  ): Promise<{ issueKey: string; transitionId: string; applied: true }> {
    await this.ensureProjectAccess(projectId, callerUserId);
    const { accessToken, cloudId } = await this.getOwnerTokens(projectId);
    const base = this.jiraService.getApiBaseUrl(cloudId);
    const key = issueKey.trim().toUpperCase();
    const id = transitionId.trim();

    if (!id) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'transitionId is required', 400);
    }

    try {
      await axios.post(
        `${base}/issue/${encodeURIComponent(key)}/transitions`,
        { transition: { id } },
        { headers: this.authHeaders(accessToken) },
      );
      return { issueKey: key, transitionId: id, applied: true };
    } catch (err) {
      throw this.toAppException(err, 'Failed to transition Jira issue');
    }
  }

  private async getOwnerTokens(projectId: string) {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
    }
    if (!project.jiraProjectKey?.trim()) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Project has no Jira project key configured',
        400,
      );
    }
    try {
      return await this.jiraService.getValidAccessToken(project.ownerId);
    } catch {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Project owner has not connected Jira',
        400,
      );
    }
  }

  private async ensureProjectAccess(projectId: string, userId: string): Promise<void> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
    }
    const isOwner = await this.projectRepo.isOwner(projectId, userId);
    const isMember = await this.projectRepo.isMember(projectId, userId);
    if (!isOwner && !isMember) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Access denied', 403);
    }
  }

  private authHeaders(accessToken: string) {
    return {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  private toAppException(err: unknown, fallback: string): AppException {
    if (isAxiosError(err)) {
      const status = err.response?.status ?? 502;
      const data = err.response?.data;
      let message = fallback;
      if (data && typeof data === 'object') {
        const msgs = (data as { errorMessages?: string[] }).errorMessages;
        if (msgs?.length) message = msgs.join('; ');
      }
      if (status === 404) {
        return new AppException(ErrorCode.NOT_FOUND, message, 404);
      }
      if (status === 400 || status === 403) {
        return new AppException(ErrorCode.BAD_REQUEST, message, 400);
      }
      return new AppException(ErrorCode.VALIDATION_ERROR, message, status >= 500 ? 502 : 400);
    }
    return new AppException(ErrorCode.VALIDATION_ERROR, fallback, 400);
  }
}
