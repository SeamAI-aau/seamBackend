import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { GithubController } from './github.controller';
import { GithubService } from './github.service';
import { GithubSyncService } from './github-sync.service';
import { BlockerDetectionService } from './blocker-detection.service';
import { GithubSyncQueue } from './queue/github-sync.queue';
import { GithubSyncProcessor } from './queue/github-sync.processor';
import { GithubSyncScheduler } from './github-sync-scheduler';
import { GITHUB_REPOSITORY } from './github.tokens';
import { PrismaGithubRepository } from '../../prisma/repositories/prisma-github.repository';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProjectModule } from '../../project/project.module';
import { QueueModule } from '../../infrastracture/queue/queue.module';
import { NotificationModule } from '../../notification/notification.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    QueueModule,
    ProjectModule,
    NotificationModule,
    BullModule.registerQueue({
      name: 'github-sync',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    }),
  ],
  controllers: [GithubController],
  providers: [
    GithubService,
    GithubSyncService,
    BlockerDetectionService,
    GithubSyncQueue,
    GithubSyncProcessor,
    GithubSyncScheduler,
    {
      provide: GITHUB_REPOSITORY,
      useClass: PrismaGithubRepository,
    },
  ],
  exports: [GithubSyncQueue, GithubService],
})
export class GithubModule {}
