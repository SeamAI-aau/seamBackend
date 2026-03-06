import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type {
  CreateProjectInput,
  IProjectRepository,
} from '../../project/types/project.repository';
import type { Prisma, Project } from '@prisma/client';

@Injectable()
export class PrismaProjectRepository implements IProjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  createProject(data: CreateProjectInput) {
    return this.prisma.project.create({ data });
  }

  findById(projectId: string) {
    return this.prisma.project.findUnique({
      where: { id: projectId },
    });
  }

  findUserProjects(userId: string) {
    return this.prisma.project.findMany({
      where: {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
    });
  }

  updateProject(projectId: string, data: Partial<Project>) {
    return this.prisma.project.update({
      where: { id: projectId },
      data,
    });
  }

  deleteProject(projectId: string) {
    return this.prisma.project.delete({ where: { id: projectId } });
  }

  async addMember(projectId: string, userId: string) {
    const data: Prisma.ProjectMemberCreateInput = {
      project: { connect: { id: projectId } },
      user: { connect: { id: userId } },
    };
    return this.prisma.projectMember.create({ data });
  }

  async isOwner(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    return project?.ownerId === userId;
  }

  async isMember(projectId: string, userId: string) {
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    return !!membership;
  }

  async findProjectIdsWithGithubRepo(): Promise<string[]> {
    const projects = await this.prisma.project.findMany({
      where: { githubRepoUrl: { not: null } },
      select: { id: true },
    });
    return projects.map((p) => p.id);
  }
}
