import { Injectable, Inject } from '@nestjs/common';
import type { PullRequest } from '@prisma/client';
import { BlockerType } from '@prisma/client';
import type { IGithubRepository } from './github.repository';
import { GITHUB_REPOSITORY } from './github.tokens';
import {
  STALE_PR_DAYS,
  WAITING_REVIEW_DAYS,
  DRAFT_TOO_LONG_DAYS,
} from './constants/github.constants';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class BlockerDetectionService {
  constructor(
    @Inject(GITHUB_REPOSITORY)
    private readonly githubRepo: IGithubRepository,
  ) {}

  async detectForProject(projectId: string): Promise<void> {
    const prs = await this.githubRepo.findPullRequestsByProjectId(projectId);

    for (const pr of prs) {
      const blockers = this.evaluateBlockers(pr, Date.now());
      await this.githubRepo.replaceBlockersForPullRequest(
        pr.id,
        projectId,
        blockers.map(({ type, message }) => ({ pullRequestId: pr.id, type, message })),
      );
    }
  }

  private evaluateBlockers(
    pr: PullRequest,
    nowMs: number,
  ): Array<{ type: BlockerType; message: string }> {
    const blockers: Array<{ type: BlockerType; message: string }> = [];
    const prUpdatedAt = pr.prUpdatedAt.getTime();
    const prCreatedAt = pr.prCreatedAt.getTime();
    const daysSinceUpdate = (nowMs - prUpdatedAt) / MS_PER_DAY;
    const daysSinceCreation = (nowMs - prCreatedAt) / MS_PER_DAY;

    const reviewers = (pr.requestedReviewerLogins as string[] | null) ?? [];
    const hasReviewers = reviewers.length > 0;

    if (pr.state !== 'OPEN') return blockers;

    if (daysSinceUpdate >= STALE_PR_DAYS) {
      blockers.push({
        type: BlockerType.STALE_PR,
        message: `PR open > ${STALE_PR_DAYS} days with no recent activity (last update ${Math.floor(daysSinceUpdate)} days ago)`,
      });
    }
    if (!hasReviewers) {
      blockers.push({ type: BlockerType.NO_REVIEWERS, message: 'PR has no reviewers assigned' });
    }
    if (hasReviewers && daysSinceUpdate >= WAITING_REVIEW_DAYS) {
      blockers.push({
        type: BlockerType.WAITING_REVIEW,
        message: `Review requested but no response for > ${WAITING_REVIEW_DAYS} days`,
      });
    }
    if (pr.draft && daysSinceCreation >= DRAFT_TOO_LONG_DAYS) {
      blockers.push({
        type: BlockerType.DRAFT_TOO_LONG,
        message: `Draft PR open > ${DRAFT_TOO_LONG_DAYS} days`,
      });
    }

    return blockers;
  }
}
