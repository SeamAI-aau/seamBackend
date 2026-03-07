import { Module } from '@nestjs/common';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';
import { TASK_REPOSITORY } from './types/task.tokens';
import { PrismaTaskRepository } from '../prisma/repositories/prisma-tasks-repository';
import { ProjectModule } from '../project/project.module';

@Module({
  imports: [ProjectModule],
  controllers: [TaskController],
  providers: [
    TaskService,
    {
      provide: TASK_REPOSITORY,
      useClass: PrismaTaskRepository,
    },
  ],
})
export class TaskModule {}

