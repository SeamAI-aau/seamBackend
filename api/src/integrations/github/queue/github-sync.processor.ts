import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { Inject } from '@nestjs/common';
import {
  GithubSyncQueue,
  GITHUB_SYNC_QUEUE_NAME,
  JOB_SYNC_ALL,
  JOB_SYNC_PROJECT,
} from './github-sync.queue';
import type {
  GithubSyncAllJobData,
  GithubSyncProjectJobData,
  GithubSyncProjectJobResult,
} from './github-sync-job.data';
import { GithubSyncService } from '../github-sync.service';
import type { IProjectRepository } from '../../../project/types/project.repository';
import { PROJECT_REPOSITORY } from '../../../project/types/project.tokens';

@Processor(GITHUB_SYNC_QUEUE_NAME)
export class GithubSyncProcessor extends WorkerHost {
  constructor(
    private readonly githubSyncService: GithubSyncService,
    private readonly githubSyncQueue: GithubSyncQueue,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: IProjectRepository,
  ) {
    super();
  }

  async process(
    job: Job<GithubSyncProjectJobData | GithubSyncAllJobData, GithubSyncProjectJobResult, string>,
  ): Promise<GithubSyncProjectJobResult | void> {
    if (job.name === JOB_SYNC_ALL) {
      const projectIds = await this.projectRepo.findProjectIdsWithGithubRepo();
      for (const projectId of projectIds) {
        await this.githubSyncQueue.enqueueSyncProject(projectId);
      }
      return;
    }

    if (job.name === JOB_SYNC_PROJECT) {
      const { projectId } = job.data as GithubSyncProjectJobData;
      return this.githubSyncService.syncPullRequests(projectId);
    }
  }
}
