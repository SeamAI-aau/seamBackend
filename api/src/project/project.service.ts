import { Inject, Injectable } from '@nestjs/common';
import { PROJECT_REPOSITORY } from './project.tokens';
import type { IProjectRepository } from './types/project.repository';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { Role } from '@prisma/client';
import { Logger } from 'nestjs-pino';
import type { CurrentUserType } from '../auth/types/current-user.type';
import type { CreateProjectDto } from './dto/create-project.dto';

@Injectable()
export class ProjectService {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: IProjectRepository,
    private readonly logger: Logger,
  ) {}

  async createProject(user: CurrentUserType, body: CreateProjectDto) {
    if (user.role !== Role.SCRUM_MASTER) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only Scrum Masters can create projects', 403);
    }

    const project = await this.projectRepo.createProject({
      name: body.name,
      description: body.description,
      ownerId: user.userId,
    });

    this.logger.log({ projectId: project.id, ownerId: user.userId }, 'Project created');

    return project;
  }

  async getUserProjects(userId: string) {
    return this.projectRepo.findUserProjects(userId);
  }

  async getProject(projectId: string, userId: string) {
    const project = await this.projectRepo.findById(projectId);

    if (!project) {
      throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
    }

    const isOwner = await this.projectRepo.isOwner(projectId, userId);
    const isMember = await this.projectRepo.isMember(projectId, userId);

    if (!isOwner && !isMember) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Access denied', 403);
    }

    return project;
  }

  async addMember(projectId: string, ownerId: string, userId: string) {
    const isOwner = await this.projectRepo.isOwner(projectId, ownerId);

    if (!isOwner) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only owner can add members', 403);
    }

    return this.projectRepo.addMember(projectId, userId);
  }
}
