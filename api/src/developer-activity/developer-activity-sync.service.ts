import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { IDeveloperActivityRepository } from './developer-activity.repository';
import { DEVELOPER_ACTIVITY_REPOSITORY } from './developer-activity.tokens';
import type { IProjectRepository } from '../project/types/project.repository';
import { PROJECT_REPOSITORY } from '../project/types/project.tokens';
import { GithubService } from '../integrations/github/github.service';
import { JiraService } from '../integrations/jira/jira.service';
import { GithubApiClient } from '../integrations/github/github.client';
import { parseGitHubRepoUrl } from '../integrations/github/utils/parse-repo-url';
// Removed unused type import to satisfy linter
import axios from 'axios';
import { PullRequestState } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';

/** Jira changelog history item */
interface JiraChangelogHistory {
  id: string;
  created: string;
  author?: { accountId: string; displayName?: string };
  items: Array<{
    field: string;
    fromString?: string;
    toString?: string;
  }>;
}

/** Jira changelog API response */
interface JiraChangelogResponse {
  values: JiraChangelogHistory[];
  total?: number;
}

@Injectable()
export class DeveloperActivitySyncService {
  constructor(
    @Inject(DEVELOPER_ACTIVITY_REPOSITORY)
    private readonly activityRepo: IDeveloperActivityRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: IProjectRepository,
    private readonly prisma: PrismaService,
    private readonly githubService: GithubService,
    private readonly jiraService: JiraService,
  ) {}

  /**
   * Sync GitHub activity (commits, PRs) for a project.
   * Caller must have project access (owner or member).
   */
  async syncGitHubActivity(
    projectId: string,
    userId: string,
  ): Promise<{ commits: number; prs: number }> {
    await this.ensureProjectAccess(projectId, userId);
    const project = await this.projectRepo.findById(projectId);
    if (!project?.githubRepoUrl?.trim()) return { commits: 0, prs: 0 };

    const ownerId = project.ownerId;
    const accessToken = await this.githubService.getValidAccessToken(ownerId);
    const { owner, repo } = parseGitHubRepoUrl(project.githubRepoUrl);
    const client = new GithubApiClient(accessToken);

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceIso = since.toISOString();

    const commits = await client.getCommits(owner, repo, { since: sinceIso, per_page: 100 });
    const loginToUserId = await this.getGitHubLoginToUserIdMap(projectId);

    // Aggregate commits by (date, user) - store daily counts, not raw commits
    const dailyCounts = new Map<string, number>();
    for (const c of commits) {
      const authorLogin = (c.author?.login ?? c.commit.author.email)?.toLowerCase();
      const userId = authorLogin ? loginToUserId.get(authorLogin) : null;
      if (!userId) continue; // only count mapped developers
      const dateStr = new Date(c.commit.author?.date ?? c.commit.committer.date)
        .toISOString()
        .slice(0, 10);
      const key = `${userId}:${dateStr}`;
      dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1);
    }

    let commitsSynced = 0;
    for (const [key, count] of dailyCounts) {
      const [uid, dateStr] = key.split(':');
      const externalId = `commit_agg:${projectId}:${uid}:${dateStr}`;
      await this.activityRepo.upsert({
        projectId,
        userId: uid,
        source: 'GITHUB',
        type: 'commit_count',
        externalId,
        title: null,
        metadata: { count, repo: `${owner}/${repo}` },
        occurredAt: new Date(dateStr),
      });
      commitsSynced++;
    }

    const prs = await this.prisma.pullRequest.findMany({
      where: { projectId },
      select: {
        githubId: true,
        title: true,
        author: true,
        state: true,
        prCreatedAt: true,
        prUpdatedAt: true,
      },
    });
    let prsSynced = 0;
    for (const pr of prs) {
      const type = pr.state === PullRequestState.CLOSED ? 'pr_merged' : 'pr_opened';
      const occurredAt = pr.state === PullRequestState.CLOSED ? pr.prUpdatedAt : pr.prCreatedAt;
      const userId = loginToUserId.get(pr.author.toLowerCase()) ?? null;
      const externalId = `pr:${pr.githubId}`;
      await this.activityRepo.upsert({
        projectId,
        userId,
        source: 'GITHUB',
        type,
        externalId,
        title: pr.title,
        metadata: { author: pr.author, state: pr.state },
        occurredAt,
      });
      prsSynced++;
    }

    return { commits: commitsSynced, prs: prsSynced };
  }

  /**
   * Sync Jira activity for a project (issue updates from changelog).
   * Caller must have project access (owner or member).
   */
  async syncJiraActivity(projectId: string, userId: string): Promise<{ issues: number }> {
    await this.ensureProjectAccess(projectId, userId);
    const project = await this.projectRepo.findById(projectId);
    if (!project?.jiraProjectKey?.trim()) return { issues: 0 };

    const ownerId = project.ownerId;
    const { accessToken, cloudId } = await this.jiraService.getValidAccessToken(ownerId);
    const jiraUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3`;

    const searchRes = await axios.get<{
      issues: Array<{ key: string; fields?: { summary?: string } }>;
    }>(`${jiraUrl}/search`, {
      params: {
        jql: `project = ${project.jiraProjectKey} ORDER BY updated DESC`,
        maxResults: 50,
        fields: 'summary,created,updated,assignee',
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    const accountIdToUserId = await this.getJiraAccountIdToUserIdMap(projectId);
    let count = 0;

    for (const issue of searchRes.data.issues ?? []) {
      let changelogRes: { data: JiraChangelogResponse };
      try {
        changelogRes = await axios.get<JiraChangelogResponse>(
          `${jiraUrl}/issue/${issue.key}/changelog`,
          {
            params: { maxResults: 50 },
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
            },
          },
        );
      } catch {
        continue;
      }
      const histories = changelogRes.data.values ?? [];
      const summary = issue.fields?.summary ?? issue.key;

      for (const h of histories) {
        const item = h.items[0];
        if (item?.field !== 'status') continue; // only store status transitions (To Do → In Progress → Done)
        const accountId = h.author?.accountId;
        const userId = accountId ? accountIdToUserId.get(accountId) : null;
        const externalId = `jira:${issue.key}:${h.id}`;
        await this.activityRepo.upsert({
          projectId,
          userId: userId ?? null,
          source: 'JIRA',
          type: 'jira_status_change',
          externalId,
          title: `${issue.key}: ${summary}`,
          metadata: {
            issueKey: issue.key,
            from: item?.fromString,
            to: item?.toString,
          },
          occurredAt: new Date(h.created),
        });
        count++;
      }
    }

    return { issues: count };
  }

  private async ensureProjectAccess(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        ownerId: true,
        members: { where: { userId, status: 'ACTIVE' }, take: 1 },
      },
    });
    if (!project) {
      throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
    }
    const isOwner = project.ownerId === userId;
    const isMember = project.members.length > 0;
    if (!isOwner && !isMember) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Access denied', 403);
    }
  }

  private async getGitHubLoginToUserIdMap(projectId: string): Promise<Map<string, string>> {
    const members = await this.prisma.projectMember.findMany({
      where: { projectId, status: 'ACTIVE', userId: { not: null } },
      include: {
        user: {
          select: { id: true, githubUsername: true, githubAccount: { select: { username: true } } },
        },
      },
    });
    const map = new Map<string, string>();
    for (const m of members) {
      if (!m.user) continue;
      const login = (m.user.githubUsername ?? m.user.githubAccount?.username)?.toLowerCase();
      if (login) map.set(login, m.user.id);
    }
    const owner = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        owner: {
          select: { id: true, githubUsername: true, githubAccount: { select: { username: true } } },
        },
      },
    });
    if (owner?.owner) {
      const login = (
        owner.owner.githubUsername ?? owner.owner.githubAccount?.username
      )?.toLowerCase();
      if (login) map.set(login, owner.owner.id);
    }
    return map;
  }

  private async getJiraAccountIdToUserIdMap(projectId: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (!project) return map;
    try {
      const accountId = await this.getJiraUserAccountId(project.ownerId);
      if (accountId) map.set(accountId, project.ownerId);
    } catch {
      // Owner may not have Jira connected
    }
    return map;
  }

  private async getJiraUserAccountId(userId: string): Promise<string | null> {
    const { accessToken, cloudId } = await this.jiraService.getValidAccessToken(userId);
    try {
      const res = await axios.get<{ accountId: string }>(
        `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/myself`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        },
      );
      return res.data?.accountId ?? null;
    } catch {
      return null;
    }
  }
}
