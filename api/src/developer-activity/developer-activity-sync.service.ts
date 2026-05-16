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
import axios from 'axios';
import { PullRequestState } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import {
  jiraActivityTypeForChangelogField,
  toJiraJqlDate,
} from './jira-activity-sync.util';
import type { JiraActivitySyncQueryDto } from './dto/jira-activity-sync-query.dto';

const JIRA_ISSUE_PAGE_SIZE = 50;
const JIRA_CHANGELOG_PAGE_SIZE = 100;
const JIRA_DEFAULT_MAX_ISSUES = 100;

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
  isLast?: boolean;
}

interface JiraSearchIssue {
  key: string;
  fields?: {
    summary?: string;
    created?: string;
    assignee?: { accountId?: string };
    reporter?: { accountId?: string };
  };
}

interface JiraComment {
  id: string;
  author?: { accountId?: string; displayName?: string };
  created?: string;
  body?: unknown;
}

interface JiraWorklog {
  id: string;
  author?: { accountId?: string };
  started?: string;
  timeSpentSeconds?: number;
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
   * Sync Jira activity for a project (changelog, comments, worklogs, issue created).
   * Uses project owner's token to read the linked Jira project.
   */
  async syncJiraActivity(
    projectId: string,
    userId: string,
    options: JiraActivitySyncQueryDto = {},
  ): Promise<{ activities: number; issuesScanned: number }> {
    await this.ensureProjectAccess(projectId, userId);
    const project = await this.projectRepo.findById(projectId);
    if (!project?.jiraProjectKey?.trim()) return { activities: 0, issuesScanned: 0 };

    const ownerId = project.ownerId;
    const { accessToken, cloudId } = await this.jiraService.getValidAccessToken(ownerId);
    const jiraUrl = this.jiraService.getApiBaseUrl(cloudId);
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    };

    const toDate = options.toDate ? new Date(options.toDate) : new Date();
    const fromDate = options.fromDate
      ? new Date(options.fromDate)
      : project.jiraLastActivitySyncAt
        ? new Date(project.jiraLastActivitySyncAt)
        : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const maxIssues = options.maxIssues ?? JIRA_DEFAULT_MAX_ISSUES;
    const jqlParts = [`project = ${project.jiraProjectKey}`, `updated >= "${toJiraJqlDate(fromDate.toISOString())}"`];
    if (options.toDate) {
      jqlParts.push(`updated <= "${toJiraJqlDate(toDate.toISOString())}"`);
    }
    const jql = `${jqlParts.join(' AND ')} ORDER BY updated DESC`;

    const accountIdToUserId = await this.getJiraAccountIdToUserIdMap(projectId);
    let activities = 0;
    let issuesScanned = 0;
    let startAt = 0;

    while (issuesScanned < maxIssues) {
      const pageSize = Math.min(JIRA_ISSUE_PAGE_SIZE, maxIssues - issuesScanned);
      const searchRes = await axios.get<{ issues?: JiraSearchIssue[] }>(`${jiraUrl}/search`, {
        params: {
          jql,
          maxResults: pageSize,
          startAt,
          fields: 'summary,created,assignee,reporter',
        },
        headers,
      });

      const issues = searchRes.data.issues ?? [];
      if (issues.length === 0) break;

      for (const issue of issues) {
        issuesScanned++;
        const summary = issue.fields?.summary ?? issue.key;

        if (issue.fields?.created) {
          const createdAt = new Date(issue.fields.created);
          if (createdAt >= fromDate && createdAt <= toDate) {
            const reporterId = issue.fields.reporter?.accountId;
            const seamUserId = reporterId ? accountIdToUserId.get(reporterId) : null;
            await this.activityRepo.upsert({
              projectId,
              userId: seamUserId ?? null,
              source: 'JIRA',
              type: 'jira_issue_created',
              externalId: `jira:created:${issue.key}`,
              title: `${issue.key}: ${summary}`,
              metadata: { issueKey: issue.key },
              occurredAt: createdAt,
            });
            activities++;
          }
        }

        activities += await this.syncIssueChangelog(
          jiraUrl,
          headers,
          projectId,
          issue,
          summary,
          accountIdToUserId,
          fromDate,
          toDate,
        );
        activities += await this.syncIssueComments(
          jiraUrl,
          headers,
          projectId,
          issue.key,
          summary,
          accountIdToUserId,
          fromDate,
          toDate,
        );
        activities += await this.syncIssueWorklogs(
          jiraUrl,
          headers,
          projectId,
          issue.key,
          summary,
          accountIdToUserId,
          fromDate,
          toDate,
        );
      }

      if (issues.length < pageSize) break;
      startAt += issues.length;
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: { jiraLastActivitySyncAt: new Date() },
    });

    return { activities, issuesScanned };
  }

  private async syncIssueChangelog(
    jiraUrl: string,
    headers: Record<string, string>,
    projectId: string,
    issue: JiraSearchIssue,
    summary: string,
    accountIdToUserId: Map<string, string>,
    fromDate: Date,
    toDate: Date,
  ): Promise<number> {
    let count = 0;
    let changelogStart = 0;
    let changelogLast = false;

    while (!changelogLast) {
      let data: JiraChangelogResponse;
      try {
        const res = await axios.get<JiraChangelogResponse>(
          `${jiraUrl}/issue/${issue.key}/changelog`,
          {
            params: { startAt: changelogStart, maxResults: JIRA_CHANGELOG_PAGE_SIZE },
            headers,
          },
        );
        data = res.data;
      } catch {
        break;
      }

      for (const h of data.values ?? []) {
        const occurredAt = new Date(h.created);
        if (occurredAt < fromDate || occurredAt > toDate) continue;

        const authorAccountId = h.author?.accountId;
        const seamUserId = authorAccountId ? accountIdToUserId.get(authorAccountId) : null;

        for (const item of h.items) {
          const type = jiraActivityTypeForChangelogField(item.field);
          if (!type) continue;

          const externalId = `jira:${issue.key}:${h.id}:${item.field}`;
          await this.activityRepo.upsert({
            projectId,
            userId: seamUserId ?? null,
            source: 'JIRA',
            type,
            externalId,
            title: `${issue.key}: ${summary}`,
            metadata: {
              issueKey: issue.key,
              field: item.field,
              from: item.fromString,
              to: item.toString,
            },
            occurredAt,
          });
          count++;
        }
      }

      changelogLast = data.isLast ?? (data.values?.length ?? 0) < JIRA_CHANGELOG_PAGE_SIZE;
      changelogStart += data.values?.length ?? 0;
      if ((data.values?.length ?? 0) === 0) break;
    }

    return count;
  }

  private async syncIssueComments(
    jiraUrl: string,
    headers: Record<string, string>,
    projectId: string,
    issueKey: string,
    summary: string,
    accountIdToUserId: Map<string, string>,
    fromDate: Date,
    toDate: Date,
  ): Promise<number> {
    let count = 0;
    try {
      const res = await axios.get<{ comments?: JiraComment[] }>(
        `${jiraUrl}/issue/${issueKey}/comment`,
        { params: { maxResults: 100 }, headers },
      );
      for (const c of res.data.comments ?? []) {
        if (!c.created) continue;
        const occurredAt = new Date(c.created);
        if (occurredAt < fromDate || occurredAt > toDate) continue;
        const accountId = c.author?.accountId;
        const seamUserId = accountId ? accountIdToUserId.get(accountId) : null;
        await this.activityRepo.upsert({
          projectId,
          userId: seamUserId ?? null,
          source: 'JIRA',
          type: 'jira_comment',
          externalId: `jira:comment:${issueKey}:${c.id}`,
          title: `${issueKey}: ${summary}`,
          metadata: {
            issueKey,
            commentId: c.id,
            authorDisplayName: c.author?.displayName,
          },
          occurredAt,
        });
        count++;
      }
    } catch {
      // comments may be disabled or restricted
    }
    return count;
  }

  private async syncIssueWorklogs(
    jiraUrl: string,
    headers: Record<string, string>,
    projectId: string,
    issueKey: string,
    summary: string,
    accountIdToUserId: Map<string, string>,
    fromDate: Date,
    toDate: Date,
  ): Promise<number> {
    let count = 0;
    try {
      const res = await axios.get<{ worklogs?: JiraWorklog[] }>(
        `${jiraUrl}/issue/${issueKey}/worklog`,
        { params: { maxResults: 100 }, headers },
      );
      for (const w of res.data.worklogs ?? []) {
        if (!w.started) continue;
        const occurredAt = new Date(w.started);
        if (occurredAt < fromDate || occurredAt > toDate) continue;
        const accountId = w.author?.accountId;
        const seamUserId = accountId ? accountIdToUserId.get(accountId) : null;
        await this.activityRepo.upsert({
          projectId,
          userId: seamUserId ?? null,
          source: 'JIRA',
          type: 'jira_worklog',
          externalId: `jira:worklog:${issueKey}:${w.id}`,
          title: `${issueKey}: ${summary}`,
          metadata: {
            issueKey,
            worklogId: w.id,
            timeSpentSeconds: w.timeSpentSeconds,
          },
          occurredAt,
        });
        count++;
      }
    } catch {
      // worklog may be restricted
    }
    return count;
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
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (!project) return new Map();

    const userIds = new Set<string>([project.ownerId]);
    const members = await this.prisma.projectMember.findMany({
      where: { projectId, status: 'ACTIVE', userId: { not: null } },
      select: { userId: true },
    });
    for (const m of members) {
      if (m.userId) userIds.add(m.userId);
    }

    const accounts = await this.prisma.jiraAccount.findMany({
      where: {
        userId: { in: [...userIds] },
        accountId: { not: null },
      },
      select: { userId: true, accountId: true },
    });

    const map = new Map<string, string>();
    for (const a of accounts) {
      if (a.accountId) map.set(a.accountId, a.userId);
    }
    return map;
  }
}
