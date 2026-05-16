import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type {
  CreateProjectInput,
  IProjectRepository,
  ProjectMemberWithUser,
} from '../../project/types/project.repository';
import type { Project } from '@prisma/client';
import { ProjectMemberStatus } from '@prisma/client';
import { parseGitHubRepoUrl } from '../../integrations/github/utils/parse-repo-url';

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

  findUserProjects(userId: string, options?: { skip?: number; take?: number }) {
    return this.prisma.project.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId, status: ProjectMemberStatus.ACTIVE } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      skip: options?.skip,
      take: options?.take,
    });
  }

  async countUserProjects(userId: string) {
    return this.prisma.project.count({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId, status: ProjectMemberStatus.ACTIVE } } },
        ],
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

  async addMemberByEmail(
    projectId: string,
    email: string,
    _userId?: string,
  ): Promise<{ member: import('@prisma/client').ProjectMember; pending: boolean }> {
    const normalizedEmail = email.trim().toLowerCase();
    const member = await this.prisma.projectMember.create({
      data: {
        projectId,
        email: normalizedEmail,
        // Always start as PENDING; user must explicitly accept the invite
        // to become an ACTIVE member associated with their user account.
        status: ProjectMemberStatus.PENDING,
        userId: null,
      },
    });
    return { member, pending: true };
  }

  async findMembersByProject(
    projectId: string,
    options?: { skip?: number; take?: number },
  ): Promise<ProjectMemberWithUser[]> {
    const rows = await this.prisma.projectMember.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      skip: options?.skip,
      take: options?.take,
      include: {
        user: {
          select: { id: true, email: true, name: true, role: true, githubUsername: true },
        },
      },
    });
    return rows as ProjectMemberWithUser[];
  }

  async countMembersByProject(projectId: string): Promise<number> {
    return this.prisma.projectMember.count({
      where: { projectId },
    });
  }

  async findPendingInvite(
    projectId: string,
    email: string,
  ): Promise<import('@prisma/client').ProjectMember | null> {
    const normalizedEmail = email.trim().toLowerCase();
    return this.prisma.projectMember.findFirst({
      where: {
        projectId,
        email: normalizedEmail,
        status: ProjectMemberStatus.PENDING,
      },
    });
  }

  async findMemberByProjectAndEmail(projectId: string, email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    return this.prisma.projectMember.findUnique({
      where: {
        projectId_email: { projectId, email: normalizedEmail },
      },
    });
  }

  async findMemberByProjectAndUserId(projectId: string, userId: string) {
    return this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId, userId },
      },
    });
  }

  async findMemberById(memberId: string): Promise<ProjectMemberWithUser | null> {
    const row = await this.prisma.projectMember.findUnique({
      where: { id: memberId },
      include: {
        user: {
          select: { id: true, email: true, name: true, role: true, githubUsername: true },
        },
      },
    });
    return row as ProjectMemberWithUser | null;
  }

  async acceptInvite(
    projectId: string,
    email: string,
    userId: string,
  ): Promise<import('@prisma/client').ProjectMember> {
    const normalizedEmail = email.trim().toLowerCase();
    await this.prisma.projectMember.updateMany({
      where: {
        projectId,
        email: normalizedEmail,
        status: ProjectMemberStatus.PENDING,
      },
      data: { userId, status: ProjectMemberStatus.ACTIVE },
    });
    const member = await this.prisma.projectMember.findFirstOrThrow({
      where: { projectId, email: normalizedEmail, userId },
    });
    return member;
  }

  async deleteMember(memberId: string): Promise<import('@prisma/client').ProjectMember> {
    return this.prisma.projectMember.delete({
      where: { id: memberId },
    });
  }

  async isOwner(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    return project?.ownerId === userId;
  }

  async isMember(projectId: string, userId: string) {
    const membership = await this.prisma.projectMember.findFirst({
      where: {
        projectId,
        userId,
        status: ProjectMemberStatus.ACTIVE,
      },
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

  async findProjectIdsByGithubRepoFullName(fullName: string): Promise<string[]> {
    const target = fullName.trim().toLowerCase();
    if (!target.includes('/')) {
      return [];
    }
    const projects = await this.prisma.project.findMany({
      where: { githubRepoUrl: { not: null } },
      select: { id: true, githubRepoUrl: true },
    });
    const ids: string[] = [];
    for (const p of projects) {
      if (!p.githubRepoUrl) continue;
      try {
        const { owner, repo } = parseGitHubRepoUrl(p.githubRepoUrl);
        if (`${owner}/${repo}`.toLowerCase() === target) {
          ids.push(p.id);
        }
      } catch {
        continue;
      }
    }
    return ids;
  }
}
