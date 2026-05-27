import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, QueueEvents } from 'bullmq';
import type {
  GithubSyncAllJobData,
  GithubSyncProjectJobData,
  GithubSyncProjectJobResult,
} from './github-sync-job.data';
import { syncProjectJobId } from './github-sync-job.data';

export const GITHUB_SYNC_QUEUE_NAME = 'github-sync';

export const JOB_SYNC_PROJECT = 'sync-project';
export const JOB_SYNC_ALL = 'sync-all';

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { age: 3600, count: 200 },
  removeOnFail: { age: 7 * 24 * 3600, count: 500 },
};

export type EnqueueSyncProjectResult = {
  jobId: string;
  queued: boolean;
  synced?: number;
  waited?: boolean;
};

@Injectable()
export class GithubSyncQueue implements OnModuleDestroy {
  private readonly logger = new Logger(GithubSyncQueue.name);
  private queueEvents: QueueEvents | null = null;

  constructor(
    @InjectQueue(GITHUB_SYNC_QUEUE_NAME)
    private readonly queue: Queue,
  ) {}

  async enqueueSyncProject(
    projectId: string,
    options?: { wait?: boolean; waitTimeoutMs?: number },
  ): Promise<EnqueueSyncProjectResult> {
    const jobId = syncProjectJobId(projectId);
    const job = await this.queue.add(
      JOB_SYNC_PROJECT,
      { projectId } as GithubSyncProjectJobData,
      {
        jobId,
        ...DEFAULT_JOB_OPTIONS,
      },
    );

    if (!options?.wait) {
      return { jobId: String(job.id), queued: true };
    }

    const timeoutMs = options.waitTimeoutMs ?? 120_000;
    try {
      const result = await job.waitUntilFinished(this.getQueueEvents(), timeoutMs);
      const synced = (result as GithubSyncProjectJobResult | undefined)?.synced ?? 0;
      return { jobId: String(job.id), queued: false, synced, waited: true };
    } catch (err) {
      this.logger.warn(
        { projectId, jobId, err: err instanceof Error ? err.message : String(err) },
        'GitHub sync job wait timed out or failed',
      );
      throw err;
    }
  }

  async enqueueSyncAll(): Promise<void> {
    await this.queue.add(JOB_SYNC_ALL, {} as GithubSyncAllJobData, {
      attempts: 1,
      removeOnComplete: { age: 3600, count: 50 },
      removeOnFail: { age: 7 * 24 * 3600, count: 100 },
    });
  }

  /**
   * Register the repeatable `sync-all` job. Called once from `SchedulingBootstrapService`.
   */
  async registerRepeatableSyncAll(repeatEveryMs: number): Promise<void> {
    await this.queue.add(JOB_SYNC_ALL, {} as GithubSyncAllJobData, {
      repeat: { every: repeatEveryMs },
      attempts: 1,
      removeOnComplete: { age: 3600, count: 50 },
      removeOnFail: { age: 7 * 24 * 3600, count: 100 },
    });
  }

  private getQueueEvents(): QueueEvents {
    if (!this.queueEvents) {
      const connection = this.queue.opts.connection;
      if (!connection) {
        throw new Error('GitHub sync queue has no Redis connection');
      }
      this.queueEvents = new QueueEvents(GITHUB_SYNC_QUEUE_NAME, { connection });
    }
    return this.queueEvents;
  }

  async onModuleDestroy(): Promise<void> {
    await this.queueEvents?.close();
  }
}
