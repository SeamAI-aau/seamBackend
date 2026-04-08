import type { GithubAccount, PullRequest, Blocker, BlockerType } from '@prisma/client';
import type { PullRequestState } from '@prisma/client';

export interface GithubAccountUpsertData {
  accessToken: string;
  refreshToken?: string;
  username?: string;
  avatarUrl?: string;
}

export interface PullRequestUpsertData {
  githubId: number;
  title: string;
  author: string;
  state: PullRequestState;
  draft: boolean;
  url: string;
  prCreatedAt: Date;
  prUpdatedAt: Date;
  reviewRequestedAt?: Date;
  requestedReviewerLogins?: string[];
}

export interface BlockerCreateData {
  pullRequestId: string;
  projectId: string;
  type: BlockerType;
  message: string;
}

export interface IGithubRepository {
  findAccountByUserId(userId: string): Promise<GithubAccount | null>;

  upsertAccount(userId: string, data: GithubAccountUpsertData): Promise<GithubAccount>;

  deleteAccountByUserId(userId: string): Promise<void>;

  upsertPullRequests(projectId: string, prs: PullRequestUpsertData[]): Promise<void>;

  findPullRequestsByProjectId(
    projectId: string,
    options?: { skip?: number; take?: number },
  ): Promise<PullRequest[]>;

  countPullRequestsByProjectId(projectId: string): Promise<number>;

  replaceBlockersForPullRequest(
    pullRequestId: string,
    projectId: string,
    blockers: Omit<BlockerCreateData, 'projectId'>[],
  ): Promise<void>;

  findBlockersByProjectId(
    projectId: string,
    options?: { skip?: number; take?: number },
  ): Promise<(Blocker & { pullRequest: PullRequest })[]>;

  countBlockersByProjectId(projectId: string): Promise<number>;
}
