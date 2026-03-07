import { Inject, Injectable } from '@nestjs/common';
import { PROJECT_REPOSITORY } from './types/project.tokens';
import type { IProjectRepository } from './types/project.repository';
import { USER_REPOSITORY } from '../user/user.token';
import type { IUserRepository } from '../user/user.repository';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { Role } from '@prisma/client';
import { Logger } from 'nestjs-pino';
import type { CurrentUserType } from '../auth/types/current-user.type';
import type { CreateProjectDto } from './dto/create-project.dto';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import type { DashboardFilterDto } from './dto/dashboard-filter.dto';
import type { BlockersFilterDto } from './dto/blockers-filter.dto';

@Injectable()
export class ProjectService {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: IProjectRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    private readonly prisma: PrismaService,
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

  async getProjectMembers(projectId: string, userId: string) {
    const project = await this.projectRepo.findById(projectId);

    if (!project) {
      throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
    }

    const isOwner = await this.projectRepo.isOwner(projectId, userId);
    const isMember = await this.projectRepo.isMember(projectId, userId);

    if (!isOwner && !isMember) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Access denied', 403);
    }

    return this.userRepo.findProjectMembers(projectId);
  }

  async getProjectDashboard(
    projectId: string,
    userId: string,
    filters: DashboardFilterDto = {},
  ) {
    const project = await this.projectRepo.findById(projectId);

    if (!project) {
      throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
    }

    const isOwner = await this.projectRepo.isOwner(projectId, userId);
    const isMember = await this.projectRepo.isMember(projectId, userId);

    if (!isOwner && !isMember) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Access denied', 403);
    }

    const taskWhere: Prisma.TaskWhereInput = {
      meeting: { projectId },
    };
    if (filters.assigneeId) taskWhere.assigneeId = filters.assigneeId;
    if (filters.status) taskWhere.status = filters.status;
    if (filters.fromDate || filters.toDate) {
      taskWhere.createdAt = {};
      if (filters.fromDate) taskWhere.createdAt.gte = new Date(filters.fromDate);
      if (filters.toDate) taskWhere.createdAt.lte = new Date(filters.toDate);
    }

    const meetingWhere: Prisma.MeetingWhereInput = {
      projectId,
    };
    if (filters.fromDate || filters.toDate) {
      meetingWhere.createdAt = {};
      if (filters.fromDate) meetingWhere.createdAt.gte = new Date(filters.fromDate);
      if (filters.toDate) meetingWhere.createdAt.lte = new Date(filters.toDate);
    }

    const recentTasksLimit = filters.recentTasksLimit ?? 10;
    const recentMeetingsLimit = filters.recentMeetingsLimit ?? 10;
    const blockersLimit = filters.blockersLimit ?? 50;

    const [
      taskCountsByStatus,
      recentTasks,
      recentMeetings,
      githubBlockers,
      transcriptBlockers,
    ] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['status'],
        _count: { id: true },
        where: taskWhere,
      }),
      this.prisma.task.findMany({
        where: taskWhere,
        take: recentTasksLimit,
        orderBy: { createdAt: 'desc' },
        include: {
          meeting: { select: { id: true, title: true } },
          assignee: { select: { id: true, email: true } },
        },
      }),
      this.prisma.meeting.findMany({
        where: meetingWhere,
        take: recentMeetingsLimit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, status: true, createdAt: true },
      }),
      this.prisma.blocker.findMany({
        where: { projectId },
        include: { pullRequest: true },
        orderBy: { createdAt: 'desc' },
        take: blockersLimit,
      }),
      this.prisma.transcriptBlocker.findMany({
        where: { projectId },
        include: { meeting: { select: { id: true, title: true } } },
        orderBy: { createdAt: 'desc' },
        take: blockersLimit,
      }),
    ]);

    const taskCounts: Record<string, number> = Object.fromEntries(
      taskCountsByStatus.map((row: { status: string; _count: { id: number } }) => [
        row.status,
        row._count.id,
      ]),
    );
    const totalTasks = taskCountsByStatus.reduce(
      (sum: number, r: { _count: { id: number } }) => sum + r._count.id,
      0,
    );
    const tasksApproved = taskCounts['APPROVED'] ?? 0;
    const tasksRejected = taskCounts['REJECTED'] ?? 0;
    const tasksPending =
      (taskCounts['EXTRACTED'] ?? 0) + (taskCounts['SENT_TO_DEVELOPER'] ?? 0);
    const openBlockersCount = githubBlockers.length + transcriptBlockers.length;

    return {
      project: { id: project.id, name: project.name },
      taskCountsByStatus: taskCounts,
      kpis: {
        totalTasks,
        tasksApproved,
        tasksRejected,
        tasksPending,
        openBlockersCount,
      },
      recentTasks,
      recentMeetings,
      blockers: {
        github: githubBlockers,
        transcript: transcriptBlockers,
      },
    };
  }

  /** Returns GitHub and transcript blockers for the project (e.g. for dashboard widgets). Scrum Master only. */
  async getProjectBlockers(
    projectId: string,
    userId: string,
    filters: BlockersFilterDto = {},
  ) {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
    }
    const isOwner = await this.projectRepo.isOwner(projectId, userId);
    const isMember = await this.projectRepo.isMember(projectId, userId);
    if (!isOwner && !isMember) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Access denied', 403);
    }

    const limit = filters.limit ?? 100;
    const githubWhere: Record<string, unknown> = { projectId };
    const transcriptWhere: Record<string, unknown> = { projectId };
    if (filters.fromDate) {
      const from = new Date(filters.fromDate);
      githubWhere.createdAt = { gte: from };
      transcriptWhere.createdAt = { gte: from };
    }
    if (filters.category) transcriptWhere.category = filters.category;

    const wantGithub = filters.source !== 'transcript';
    const wantTranscript = filters.source !== 'github';

    const [github, transcript] = await Promise.all([
      wantGithub
        ? this.prisma.blocker.findMany({
            where: githubWhere,
            include: { pullRequest: true },
            orderBy: { createdAt: 'desc' },
            take: limit,
          })
        : [],
      wantTranscript
        ? this.prisma.transcriptBlocker.findMany({
            where: transcriptWhere,
            include: { meeting: { select: { id: true, title: true } } },
            orderBy: { createdAt: 'desc' },
            take: limit,
          })
        : [],
    ]);
    return { github, transcript };
  }
}
