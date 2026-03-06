import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { JiraController } from './jira.controller';
import { JiraService } from './jira.service';
import { JiraSyncService } from './jira-sync.service';
import { JiraSyncQueue } from './queue/jira-sync.queue';
import { JiraSyncProcessor } from './queue/jira.sync.processor';
import { JIRA_REPOSITORY } from './jira.tokens';
import { PrismaJiraRepository } from '../../prisma/repositories/prisma-jira.repository';
import { PrismaModule } from '../../prisma/prisma.module';
import { TaskModule } from '../../tasks/task.module';
import { QueueModule } from '../../infrastracture/queue/queue.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    QueueModule,
    BullModule.registerQueue({
      name: 'jira-sync',
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
      },
    }),
    forwardRef(() => TaskModule),
  ],
  controllers: [JiraController],
  providers: [
    JiraService,
    JiraSyncService,
    JiraSyncQueue,
    JiraSyncProcessor,
    {
      provide: JIRA_REPOSITORY,
      useClass: PrismaJiraRepository,
    },
  ],
  exports: [JiraSyncQueue, JiraService],
})
export class JiraModule {}
