import { Module } from '@nestjs/common';
import { DeveloperActivityController } from './developer-activity.controller';
import { DeveloperActivityService } from './developer-activity.service';
import { DeveloperActivitySyncService } from './developer-activity-sync.service';
import { DEVELOPER_ACTIVITY_REPOSITORY } from './developer-activity.tokens';
import { PrismaDeveloperActivityRepository } from './prisma-developer-activity.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { ProjectModule } from '../project/project.module';
import { GithubModule } from '../integrations/github/github.module';
import { JiraModule } from '../integrations/jira/jira.module';

@Module({
  imports: [PrismaModule, ProjectModule, GithubModule, JiraModule],
  controllers: [DeveloperActivityController],
  providers: [
    DeveloperActivityService,
    DeveloperActivitySyncService,
    {
      provide: DEVELOPER_ACTIVITY_REPOSITORY,
      useClass: PrismaDeveloperActivityRepository,
    },
  ],
  exports: [DeveloperActivityService],
})
export class DeveloperActivityModule {}
