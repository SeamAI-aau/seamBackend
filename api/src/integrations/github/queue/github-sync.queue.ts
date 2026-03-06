import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { GithubSyncProjectJobData, GithubSyncAllJobData } from './github-sync-job.data';

export const GITHUB_SYNC_QUEUE_NAME = 'github-sync';

export const JOB_SYNC_PROJECT = 'sync-project';
export const JOB_SYNC_ALL = 'sync-all';

/** 10 minutes in ms */
const SYNC_ALL_REPEAT_MS = 10 * 60 * 1000;

@Injectable()
export class GithubSyncQueue {
  constructor(
    @InjectQueue(GITHUB_SYNC_QUEUE_NAME)
    private readonly queue: Queue,
  ) {}

  async enqueueSyncProject(projectId: string): Promise<void> {
    await this.queue.add(
      JOB_SYNC_PROJECT,
      { projectId } as GithubSyncProjectJobData,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
  }

  async enqueueSyncAll(): Promise<void> {
    await this.queue.add(
      JOB_SYNC_ALL,
      {} as GithubSyncAllJobData,
      {
        attempts: 1,
      },
    );
  }

  /**
   * Register the repeatable job that runs every 10 minutes.
   * Call once (e.g. on module init).
   */
  async registerRepeatableSyncAll(): Promise<void> {
    await this.queue.add(
      JOB_SYNC_ALL,
      {} as GithubSyncAllJobData,
      {
        repeat: { every: SYNC_ALL_REPEAT_MS },
        attempts: 1,
      },
    );
  }
}
