import { Module, forwardRef } from '@nestjs/common';
import { ProjectService } from './project.service';
import { ProjectController } from './project.controller';
import { InternalProjectBlockersController } from './internal-project-blockers.controller';
import { InternalProjectMembersController } from './internal-project-members.controller';
import { PROJECT_REPOSITORY } from './types/project.tokens';
import { PrismaProjectRepository } from '../prisma/repositories/prisma-project.repository';
import { UserModule } from '../user/user.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [forwardRef(() => UserModule), ActivityLogModule, NotificationModule],
  controllers: [
    ProjectController,
    InternalProjectBlockersController,
    InternalProjectMembersController,
  ],
  providers: [
    ProjectService,
    {
      provide: PROJECT_REPOSITORY,
      useClass: PrismaProjectRepository,
    },
  ],
  exports: [PROJECT_REPOSITORY, ProjectService],
})
export class ProjectModule {}
