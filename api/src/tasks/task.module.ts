import { Module, forwardRef } from '@nestjs/common';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';
import { TASK_REPOSITORY } from './task-tokens';
import { PrismaTaskRepository } from '../prisma/repositories/prisma-tasks-repository';
import { JiraModule } from '../integrations/jira/jira.module';

@Module({
  imports: [forwardRef(() => JiraModule)],
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
