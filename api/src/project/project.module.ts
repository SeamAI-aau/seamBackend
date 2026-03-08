import { Module } from '@nestjs/common';
import { ProjectService } from './project.service';
import { ProjectController } from './project.controller';
import { InternalProjectBlockersController } from './internal-project-blockers.controller';
import { PROJECT_REPOSITORY } from './types/project.tokens';
import { PrismaProjectRepository } from '../prisma/repositories/prisma-project.repository';
import { UserModule } from '../user/user.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';

@Module({
  imports: [UserModule, ActivityLogModule],
  controllers: [ProjectController, InternalProjectBlockersController],
  providers: [
    ProjectService,
    {
      provide: PROJECT_REPOSITORY,
      useClass: PrismaProjectRepository,
    },
  ],
  exports: [PROJECT_REPOSITORY],
})
export class ProjectModule {}
