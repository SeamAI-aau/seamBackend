import { Injectable, Inject } from '@nestjs/common';
import type { IGithubRepository } from './github.repository';
import type { PullRequestUpsertData } from './github.repository';
import { GITHUB_REPOSITORY } from './github.tokens';
import { GithubService } from './github.service';
import { GithubApiClient } from './github.client';
import { parseGitHubRepoUrl } from './utils/parse-repo-url';
import type { IProjectRepository } from '../../project/types/project.repository';
import { PROJECT_REPOSITORY } from '../../project/types/project.tokens';
import { PullRequestState } from '@prisma/client';
import type { GitHubPullRequest } from './types/github-api.types';
import { BlockerDetectionService } from './blocker-detection.service';

@Injectable()
export class GithubSyncService {
  constructor(
    @Inject(GITHUB_REPOSITORY)
    private readonly githubRepo: IGithubRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: IProjectRepository,
    private readonly githubService: GithubService,
    private readonly blockerDetection: BlockerDetectionService,
  ) {}

  /**
   * Link a repository URL to a project. Caller must ensure user is project owner.
   */
  async linkRepo(projectId: string, repoUrl: string, ownerId: string): Promise<void> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) throw new Error('Project not found');
    const isOwner = await this.projectRepo.isOwner(projectId, ownerId);
    if (!isOwner) throw new Error('Only project owner can link a repository');

    parseGitHubRepoUrl(repoUrl);
    await this.projectRepo.updateProject(projectId, {
      githubRepoUrl: repoUrl.trim().replace(/\/$/, ''),
    });
  }

  /**
   * Sync pull requests from GitHub for a project and run blocker detection.
   */
  async syncPullRequests(projectId: string): Promise<{ synced: number }> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) throw new Error('Project not found');
    if (!project.githubRepoUrl?.trim()) throw new Error('Project has no GitHub repo linked');

    const ownerId = project.ownerId;
    const accessToken = await this.githubService.getValidAccessToken(ownerId);
    const { owner, repo } = parseGitHubRepoUrl(project.githubRepoUrl);

    const client = new GithubApiClient(accessToken);
    const ghPrs = await client.getPullRequests(owner, repo);

    const prs: PullRequestUpsertData[] = ghPrs.map((pr) => mapGitHubPrToUpsert(pr));
    await this.githubRepo.upsertPullRequests(projectId, prs);

    await this.blockerDetection.detectForProject(projectId);

    return { synced: prs.length };
  }

  async getPullRequests(projectId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.githubRepo.findPullRequestsByProjectId(projectId, { skip, take: limit }),
      this.githubRepo.countPullRequestsByProjectId(projectId),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  async getBlockers(projectId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.githubRepo.findBlockersByProjectId(projectId, { skip, take: limit }),
      this.githubRepo.countBlockersByProjectId(projectId),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }
}

function mapGitHubPrToUpsert(pr: GitHubPullRequest): PullRequestUpsertData {
  const author = pr.user?.login ?? 'unknown';
  const state = pr.state === 'open' ? PullRequestState.OPEN : PullRequestState.CLOSED;
  const requestedReviewerLogins =
    pr.requested_reviewers && pr.requested_reviewers.length > 0
      ? pr.requested_reviewers.map((u) => u.login)
      : undefined;

  return {
    githubId: BigInt(pr.id),
    title: pr.title,
    author,
    state,
    draft: pr.draft,
    url: pr.html_url,
    prCreatedAt: new Date(pr.created_at),
    prUpdatedAt: new Date(pr.updated_at),
    requestedReviewerLogins,
  };
}
