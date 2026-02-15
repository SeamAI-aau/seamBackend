import { Module } from '@nestjs/common';
import { ProjectService } from './project.service';
import { ProjectController } from './project.controller';
import { PROJECT_REPOSITORY } from './project.tokens';
import { PrismaProjectRepository } from '../prisma/repositories/prisma-project.repository';

@Module({
  controllers: [ProjectController],
  providers: [
    ProjectService,
    {
      provide: PROJECT_REPOSITORY,
      useClass: PrismaProjectRepository,
    },
  ],
})
export class ProjectModule {}
