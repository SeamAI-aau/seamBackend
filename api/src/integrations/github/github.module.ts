import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { GithubController } from './github.controller';
import { GithubWebhookController } from './github-webhook.controller';
import { GithubService } from './github.service';
import { GithubSyncService } from './github-sync.service';
import { GithubWebhookService } from './github-webhook.service';
import { BlockerDetectionService } from './blocker-detection.service';
import { GithubSyncQueue } from './queue/github-sync.queue';
import { NoopGithubSyncQueue } from './queue/noop-github-sync.queue';
import { GithubSyncProcessor } from './queue/github-sync.processor';
import { GITHUB_REPOSITORY } from './github.tokens';
import { PrismaGithubRepository } from '../../prisma/repositories/prisma-github.repository';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProjectModule } from '../../project/project.module';
import { QueueModule } from '../../infrastracture/queue/queue.module';
import { NotificationModule } from '../../notification/notification.module';

const queuesEnabled = process.env.DISABLE_QUEUES !== 'true';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    QueueModule,
    ProjectModule,
    NotificationModule,
    ...(queuesEnabled
      ? [
          BullModule.registerQueue({
            name: 'github-sync',
            defaultJobOptions: {
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
            },
          }),
        ]
      : []),
  ],
  controllers: [GithubController, GithubWebhookController],
  providers: [
    GithubService,
    GithubSyncService,
    GithubWebhookService,
    BlockerDetectionService,
    ...(queuesEnabled
      ? [GithubSyncQueue, GithubSyncProcessor]
      : [{ provide: GithubSyncQueue, useClass: NoopGithubSyncQueue }]),
    {
      provide: GITHUB_REPOSITORY,
      useClass: PrismaGithubRepository,
    },
  ],
  exports: [GithubSyncQueue, GithubService],
})
export class GithubModule {}
