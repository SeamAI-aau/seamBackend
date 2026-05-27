import { Injectable, Logger } from '@nestjs/common';
import type { EnqueueSyncProjectResult } from './github-sync.queue';

@Injectable()
export class NoopGithubSyncQueue {
  private readonly logger = new Logger(NoopGithubSyncQueue.name);

  async enqueueSyncProject(projectId: string): Promise<EnqueueSyncProjectResult> {
    this.logger.warn(
      `DISABLE_QUEUES=true — dropped GitHub sync-project for projectId=${projectId}. ` +
        'PR data will not update until queues are enabled.',
    );
    return { jobId: 'noop', queued: true };
  }

  async enqueueSyncAll(): Promise<void> {
    this.logger.warn('DISABLE_QUEUES=true — skipped GitHub sync-all enqueue');
  }

  async registerRepeatableSyncAll(_repeatEveryMs: number): Promise<void> {
    return;
  }
}
