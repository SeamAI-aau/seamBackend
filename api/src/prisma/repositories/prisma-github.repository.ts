import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type {
  IGithubRepository,
  GithubAccountUpsertData,
  PullRequestUpsertData,
  BlockerCreateData,
} from '../../integrations/github/github.repository';
import { PullRequestState } from '@prisma/client';

@Injectable()
export class PrismaGithubRepository implements IGithubRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAccountByUserId(userId: string) {
    return this.prisma.githubAccount.findUnique({
      where: { userId },
    });
  }

  async upsertAccount(userId: string, data: GithubAccountUpsertData) {
    return this.prisma.githubAccount.upsert({
      where: { userId },
      update: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken ?? undefined,
      },
      create: {
        userId,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      },
    });
  }

  async deleteAccountByUserId(userId: string): Promise<void> {
    await this.prisma.githubAccount.deleteMany({ where: { userId } });
  }

  async upsertPullRequests(projectId: string, prs: PullRequestUpsertData[]): Promise<void> {
    await this.prisma.$transaction(
      prs.map((pr) =>
        this.prisma.pullRequest.upsert({
          where: { githubId: pr.githubId },
          update: {
            title: pr.title,
            author: pr.author,
            state: pr.state,
            draft: pr.draft,
            url: pr.url,
            prCreatedAt: pr.prCreatedAt,
            prUpdatedAt: pr.prUpdatedAt,
            reviewRequestedAt: pr.reviewRequestedAt ?? null,
            requestedReviewerLogins: pr.requestedReviewerLogins ?? undefined,
          },
          create: {
            projectId,
            githubId: pr.githubId,
            title: pr.title,
            author: pr.author,
            state: pr.state,
            draft: pr.draft,
            url: pr.url,
            prCreatedAt: pr.prCreatedAt,
            prUpdatedAt: pr.prUpdatedAt,
            reviewRequestedAt: pr.reviewRequestedAt ?? null,
            requestedReviewerLogins: pr.requestedReviewerLogins ?? undefined,
          },
        }),
      ),
    );
  }

  async findPullRequestsByProjectId(
    projectId: string,
    options?: { skip?: number; take?: number },
  ) {
    return this.prisma.pullRequest.findMany({
      where: { projectId },
      orderBy: { prUpdatedAt: 'desc' },
      skip: options?.skip,
      take: options?.take,
    });
  }

  async countPullRequestsByProjectId(projectId: string) {
    return this.prisma.pullRequest.count({ where: { projectId } });
  }

  async replaceBlockersForPullRequest(
    pullRequestId: string,
    projectId: string,
    blockers: Omit<BlockerCreateData, 'projectId'>[],
  ): Promise<void> {
    await this.prisma.blocker.deleteMany({ where: { pullRequestId } });
    if (blockers.length > 0) {
      await this.prisma.blocker.createMany({
        data: blockers.map((b) => ({
          pullRequestId,
          projectId,
          type: b.type,
          message: b.message,
        })),
      });
    }
  }

  async findBlockersByProjectId(
    projectId: string,
    options?: { skip?: number; take?: number },
  ) {
    return this.prisma.blocker.findMany({
      where: { projectId },
      include: { pullRequest: true },
      orderBy: { createdAt: 'desc' },
      skip: options?.skip,
      take: options?.take,
    });
  }

  async countBlockersByProjectId(projectId: string) {
    return this.prisma.blocker.count({ where: { projectId } });
  }
}
