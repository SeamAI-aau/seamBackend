import { Module, forwardRef } from '@nestjs/common';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';
import { TASK_REPOSITORY } from './types/task.tokens';
import { PrismaTaskRepository } from '../prisma/repositories/prisma-tasks-repository';
import { JiraModule } from '../integrations/jira/jira.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { ProjectModule } from '../project/project.module';
import { NotificationModule } from '../notification/notification.module';
import { RealtimeModule } from '../infrastracture/realtime/realtime.module';

@Module({
  imports: [forwardRef(() => JiraModule), ActivityLogModule, ProjectModule, NotificationModule, RealtimeModule],
  controllers: [TaskController],
  providers: [
    TaskService,
    {
      provide: TASK_REPOSITORY,
      useClass: PrismaTaskRepository,
    },
  ],
  exports: [TASK_REPOSITORY],
})
export class TaskModule {}
