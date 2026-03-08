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

function parseGithubRepoUrl(
  url: string | null,
): { repoUrl: string | null; repoName: string | null; organization: string | null } {
  if (!url?.trim()) return { repoUrl: null, repoName: null, organization: null };
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'github.com') {
      return { repoUrl: url, repoName: null, organization: null };
    }
    const parts = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/');
    const org = parts[0] ?? null;
    const repo = parts[1] ?? null;
    return { repoUrl: url, repoName: repo, organization: org };
  } catch {
    return { repoUrl: url, repoName: null, organization: null };
  }
}

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

  async getUserProjects(
    userId: string,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.projectRepo.findUserProjects(userId, { skip, take: limit }),
      this.projectRepo.countUserProjects(userId),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
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

  async getProjectMembers(
    projectId: string,
    userId: string,
    page = 1,
    limit = 20,
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

    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.userRepo.findProjectMembers(projectId, { skip, take: limit }),
      this.userRepo.countProjectMembers(projectId),
    ]);
    const items = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
    }));
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  /**
   * Project config for Scrum Masters and developers: integrations (GitHub, Jira) and members with project role.
   */
  async getProjectConfig(projectId: string, userId: string) {
    const project = await this.projectRepo.findById(projectId);

    if (!project) {
      throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
    }

    const isOwner = await this.projectRepo.isOwner(projectId, userId);
    const isMember = await this.projectRepo.isMember(projectId, userId);

    if (!isOwner && !isMember) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Access denied', 403);
    }

    const members = await this.userRepo.findProjectMembers(projectId);
    const membersWithRole = members.map((user) => ({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      githubUsername: user.githubUsername ?? null,
      projectRole: user.id === project.ownerId ? ('owner' as const) : ('member' as const),
    }));

    const integrations = {
      github: parseGithubRepoUrl(project.githubRepoUrl ?? null),
      jira: {
        projectKey: project.jiraProjectKey ?? null,
      },
    };

    return {
      project: { id: project.id, name: project.name },
      integrations,
      members: membersWithRole,
    };
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
    const recentTasksPage = filters.recentTasksPage ?? 1;
    const recentMeetingsPage = filters.recentMeetingsPage ?? 1;
    const blockersPage = filters.blockersPage ?? 1;
    const recentTasksSkip = (recentTasksPage - 1) * recentTasksLimit;
    const recentMeetingsSkip = (recentMeetingsPage - 1) * recentMeetingsLimit;
    const blockersSkip = (blockersPage - 1) * blockersLimit;

    const [
      taskCountsByStatus,
      recentTasksData,
      recentMeetingsData,
      githubBlockersData,
      transcriptBlockersData,
    ] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['status'],
        _count: { id: true },
        where: taskWhere,
      }),
      Promise.all([
        this.prisma.task.findMany({
          where: taskWhere,
          skip: recentTasksSkip,
          take: recentTasksLimit,
          orderBy: { createdAt: 'desc' },
          include: {
            meeting: { select: { id: true, title: true } },
            assignee: { select: { id: true, email: true, name: true } },
          },
        }),
        this.prisma.task.count({ where: taskWhere }),
      ]),
      Promise.all([
        this.prisma.meeting.findMany({
          where: meetingWhere,
          skip: recentMeetingsSkip,
          take: recentMeetingsLimit,
          orderBy: { createdAt: 'desc' },
          select: { id: true, title: true, status: true, createdAt: true },
        }),
        this.prisma.meeting.count({ where: meetingWhere }),
      ]),
      Promise.all([
        this.prisma.blocker.findMany({
          where: { projectId },
          include: { pullRequest: true },
          orderBy: { createdAt: 'desc' },
          skip: blockersSkip,
          take: blockersLimit,
        }),
        this.prisma.blocker.count({ where: { projectId } }),
      ]),
      Promise.all([
        this.prisma.transcriptBlocker.findMany({
          where: { projectId },
          include: { meeting: { select: { id: true, title: true } } },
          orderBy: { createdAt: 'desc' },
          skip: blockersSkip,
          take: blockersLimit,
        }),
        this.prisma.transcriptBlocker.count({ where: { projectId } }),
      ]),
    ]);

    const [recentTasks, recentTasksTotal] = recentTasksData;
    const [recentMeetings, recentMeetingsTotal] = recentMeetingsData;
    const [githubBlockers, githubBlockersTotal] = githubBlockersData;
    const [transcriptBlockers, transcriptBlockersTotal] = transcriptBlockersData;

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
    const openBlockersCount = githubBlockersTotal + transcriptBlockersTotal;

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
      recentTasks: {
        items: recentTasks,
        total: recentTasksTotal,
        page: recentTasksPage,
        limit: recentTasksLimit,
        totalPages: Math.ceil(recentTasksTotal / recentTasksLimit) || 1,
      },
      recentMeetings: {
        items: recentMeetings,
        total: recentMeetingsTotal,
        page: recentMeetingsPage,
        limit: recentMeetingsLimit,
        totalPages: Math.ceil(recentMeetingsTotal / recentMeetingsLimit) || 1,
      },
      blockers: {
        github: {
          items: githubBlockers,
          total: githubBlockersTotal,
          page: blockersPage,
          limit: blockersLimit,
          totalPages: Math.ceil(githubBlockersTotal / blockersLimit) || 1,
        },
        transcript: {
          items: transcriptBlockers,
          total: transcriptBlockersTotal,
          page: blockersPage,
          limit: blockersLimit,
          totalPages: Math.ceil(transcriptBlockersTotal / blockersLimit) || 1,
        },
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

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const skip = (page - 1) * limit;
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

    const [githubResult, transcriptResult] = await Promise.all([
      wantGithub
        ? Promise.all([
            this.prisma.blocker.findMany({
              where: githubWhere,
              include: { pullRequest: true },
              orderBy: { createdAt: 'desc' },
              skip,
              take: limit,
            }),
            this.prisma.blocker.count({ where: githubWhere }),
          ]).then(([items, total]) => ({
            items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit) || 1,
          }))
        : { items: [], total: 0, page, limit, totalPages: 1 },
      wantTranscript
        ? Promise.all([
            this.prisma.transcriptBlocker.findMany({
              where: transcriptWhere,
              include: { meeting: { select: { id: true, title: true } } },
              orderBy: { createdAt: 'desc' },
              skip,
              take: limit,
            }),
            this.prisma.transcriptBlocker.count({ where: transcriptWhere }),
          ]).then(([items, total]) => ({
            items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit) || 1,
          }))
        : { items: [], total: 0, page, limit, totalPages: 1 },
    ]);
    return { github: githubResult, transcript: transcriptResult };
  }
}
