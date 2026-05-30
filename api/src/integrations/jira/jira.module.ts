import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { JiraController } from './jira.controller';
import { JiraService } from './jira.service';
import { JiraSyncService } from './jira-sync.service';
import { JiraIssueService } from './jira-issue.service';
import { JiraContextService } from './jira-context.service';
import { InternalJiraController } from './internal-jira.controller';
import { JiraSyncQueue } from './queue/jira-sync.queue';
import { JiraSyncProcessor } from './queue/jira.sync.processor';
import { NoopJiraSyncQueue } from './queue/noop-jira-sync.queue';
import { JIRA_REPOSITORY } from './jira.tokens';
import { PrismaJiraRepository } from '../../prisma/repositories/prisma-jira.repository';
import { PrismaModule } from '../../prisma/prisma.module';
import { TaskModule } from '../../tasks/task.module';
import { QueueModule } from '../../infrastracture/queue/queue.module';
import { ProjectModule } from '../../project/project.module';

const queuesEnabled = process.env.DISABLE_QUEUES !== 'true';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    ProjectModule,
    QueueModule,
    ...(queuesEnabled
      ? [
          BullModule.registerQueue({
            name: 'jira-sync',
            defaultJobOptions: {
              attempts: 5,
              backoff: { type: 'exponential', delay: 5000 },
            },
          }),
        ]
      : []),
    forwardRef(() => TaskModule),
  ],
  controllers: [JiraController, InternalJiraController],
  providers: [
    JiraService,
    JiraSyncService,
    JiraIssueService,
    JiraContextService,
    ...(queuesEnabled
      ? [JiraSyncQueue, JiraSyncProcessor]
      : [{ provide: JiraSyncQueue, useClass: NoopJiraSyncQueue }]),
    {
      provide: JIRA_REPOSITORY,
      useClass: PrismaJiraRepository,
    },
  ],
  exports: [
    JiraSyncQueue,
    JiraSyncService,
    JiraService,
    JiraIssueService,
    JiraContextService,
  ],
})
export class JiraModule {}
