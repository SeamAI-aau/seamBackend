import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GithubSyncQueue } from '../../integrations/github/queue/github-sync.queue';
import { DEFAULT_GITHUB_SYNC_REPEAT_MS } from './scheduling.constants';

/**
 * Registers all BullMQ repeatable jobs in one place (Phase 8).
 * Workers must share Redis; repeatables are safe across multiple API instances
 * when only one worker process consumes each queue.
 */
@Injectable()
export class SchedulingBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(SchedulingBootstrapService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly githubSyncQueue: GithubSyncQueue,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('DISABLE_QUEUES') === 'true') {
      this.logger.log('DISABLE_QUEUES=true — skipping repeatable job registration');
      return;
    }

    const repeatRaw = this.config.get<string>('GITHUB_SYNC_REPEAT_MS');
    const parsed = repeatRaw ? Number.parseInt(repeatRaw, 10) : NaN;
    const repeatMs =
      Number.isFinite(parsed) && parsed >= 60_000 ? parsed : DEFAULT_GITHUB_SYNC_REPEAT_MS;

    await this.githubSyncQueue.registerRepeatableSyncAll(repeatMs);
    this.logger.log(
      `Registered GitHub sync-all repeatable job (every ${repeatMs}ms). ` +
        'PR webhooks and manual sync also enqueue per-project jobs.',
    );
  }
}
