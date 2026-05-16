import { Inject, Injectable } from '@nestjs/common';
import { PROJECT_REPOSITORY } from './types/project.tokens';
import type { IProjectRepository } from './types/project.repository';
import { USER_REPOSITORY } from '../user/user.token';
import type { IUserRepository } from '../user/user.repository';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { Role } from '@prisma/client';
import { Logger } from 'nestjs-pino';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { NotificationService } from '../notification/notification.service';
import { ConfigService } from '@nestjs/config';
import type { CurrentUserType } from '../auth/types/current-user.type';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import type { DashboardFilterDto } from './dto/dashboard-filter.dto';
import type { BlockersFilterDto } from './dto/blockers-filter.dto';

function parseGithubRepoUrl(url: string | null): {
  repoUrl: string | null;
  repoName: string | null;
  organization: string | null;
} {
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
    private readonly activityLog: ActivityLogService,
    private readonly notification: NotificationService,
    private readonly config: ConfigService,
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

  async getUserProjects(userId: string, page = 1, limit = 20) {
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

  async updateProject(projectId: string, userId: string, body: UpdateProjectDto) {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
    }
    const isOwner = await this.projectRepo.isOwner(projectId, userId);
    if (!isOwner) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only project owner can update project', 403);
    }
    const data: Parameters<IProjectRepository['updateProject']>[1] = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.githubRepoUrl !== undefined) data.githubRepoUrl = body.githubRepoUrl;
    if (body.jiraProjectKey !== undefined) data.jiraProjectKey = body.jiraProjectKey;
    if (Object.keys(data).length === 0) return project;
    return this.projectRepo.updateProject(projectId, data);
  }

  async addMemberByEmail(projectId: string, ownerId: string, email: string) {
    const isOwner = await this.projectRepo.isOwner(projectId, ownerId);
    if (!isOwner) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only owner can add members', 403);
    }

    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingByEmail = await this.projectRepo.findMemberByProjectAndEmail(
      projectId,
      normalizedEmail,
    );
    if (existingByEmail) {
      if (existingByEmail.status === 'PENDING') {
        throw new AppException(
          ErrorCode.CONFLICT,
          'An invitation for this email is already pending',
          409,
          { memberId: existingByEmail.id, email: normalizedEmail },
        );
      }
      throw new AppException(
        ErrorCode.CONFLICT,
        'User is already a member of this project',
        409,
        { memberId: existingByEmail.id, email: normalizedEmail },
      );
    }

    // Always create a pending invitation first; membership becomes ACTIVE only
    // after the invited user explicitly accepts the invite.
    const { member, pending } = await this.projectRepo.addMemberByEmail(
      projectId,
      normalizedEmail,
      undefined,
    );
    this.activityLog
      .log({
        projectId,
        userId: ownerId,
        action: pending ? 'invitation.sent' : 'member.added',
        entityType: 'ProjectMember',
        entityId: member.id,
        metadata: { email: normalizedEmail, pending },
      })
      .catch((error) => {
        this.logger.warn(
          { projectId, ownerId, err: error },
          'Failed to write activity log for addMemberByEmail',
        );
      });

    if (pending && project) {
      const appUrl =
        this.config.get<string>('APP_URL') ??
        this.config.get<string>('FRONTEND_URL') ??
        'https://app.seam.dev';
      const baseUrl = appUrl.replace(/\/+$/, '');
      const acceptUrl = `${baseUrl}/auth/invite?projectId=${project.id}&email=${encodeURIComponent(
        normalizedEmail,
      )}`;

      const emailSent = await this.notification
        .notifyEmailOnly({
          to: normalizedEmail,
          type: 'invitation_sent',
          title: `You're invited to ${project.name}`,
          body: [
            `You've been invited to join the project "${project.name}".`,
            '',
            'Sign in or create a developer account with this email address, then accept the invitation to access the project workspace.',
          ].join('\n'),
          actionUrl: acceptUrl,
          actionLabel: 'Accept invitation',
        })
        .catch((error) => {
          this.logger.warn(
            { projectId, email: normalizedEmail, err: error },
            'Failed to send invitation email',
          );
          return false;
        });

      // If the email could not be sent, roll back the pending member to avoid
      // dangling invitations that the user never received.
      if (!emailSent) {
        await this.projectRepo.deleteMember(member.id);
        const smtpHint = this.notification.isEmailConfigured()
          ? 'Failed to send invitation email. Check SMTP credentials and try again.'
          : 'Email is not configured on the server (SMTP_HOST / SMTP_USER / SMTP_PASS).';
        throw new AppException(ErrorCode.INTERNAL_SERVER_ERROR, smtpHint, 500);
      }
    }
    return {
      id: member.id,
      email: member.email,
      status: member.status,
      userId: member.userId ?? null,
      pending,
    };
  }

  async acceptInvite(projectId: string, userId: string, inviteEmail: string) {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
    }

    const normalizedEmail = inviteEmail.trim().toLowerCase();
    const pending = await this.projectRepo.findPendingInvite(projectId, normalizedEmail);
    if (!pending) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        'No pending invitation found for this email',
        404,
      );
    }

    const user = await this.userRepo.findById(userId);
    if (!user || (user.email?.trim().toLowerCase() ?? '') !== normalizedEmail) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'You can only accept an invitation sent to your own email',
        403,
      );
    }

    const existingMember = await this.projectRepo.isMember(projectId, userId);
    if (existingMember) {
      await this.projectRepo.deleteMember(pending.id);
      throw new AppException(ErrorCode.CONFLICT, 'You are already a member of this project', 409);
    }

    const result = await this.projectRepo.acceptInvite(projectId, normalizedEmail, userId);
    this.activityLog
      .log({
        projectId,
        userId,
        action: 'invitation.accepted',
        entityType: 'ProjectMember',
        entityId: result.id,
        metadata: { email: normalizedEmail },
      })
      .catch((error) => {
        this.logger.warn(
          { projectId, userId, err: error },
          'Failed to write activity log for acceptInvite',
        );
      });

    const ownerId = project.ownerId;
    if (ownerId && ownerId !== userId) {
      this.notification
        .notify({
          userId: ownerId,
          type: 'invitation_accepted',
          title: `${user?.name ?? normalizedEmail} joined the project`,
          body: `${user?.name ?? normalizedEmail} accepted the invitation to join ${project.name}.`,
          metadata: { projectId, userId },
        })
        .catch((error) => {
          this.logger.warn(
            { projectId, ownerId, invitedUserId: userId, err: error },
            'Failed to send invitation_accepted notification',
          );
        });
    }
    return result;
  }

  async removeMember(projectId: string, memberId: string, requesterId: string) {
    const isOwner = await this.projectRepo.isOwner(projectId, requesterId);
    if (!isOwner) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Only owner can remove members or cancel invites',
        403,
      );
    }

    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
    }

    const member = await this.resolveMemberForRemoval(projectId, memberId);
    if (!member) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Member or invite not found', 404);
    }

    if (member.userId && member.userId === project.ownerId) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Cannot remove the project owner', 403);
    }

    const wasActive = member.status === 'ACTIVE';

    const result = await this.projectRepo.deleteMember(member.id);
    this.activityLog
      .log({
        projectId,
        userId: requesterId,
        action: wasActive ? 'member.removed' : 'invitation.cancelled',
        entityType: 'ProjectMember',
        entityId: member.id,
        metadata: { email: member.email, status: member.status },
      })
      .catch((error) => {
        this.logger.warn(
          { projectId, requesterId, memberId: member.id, err: error },
          'Failed to write activity log for removeMember',
        );
      });

    if (wasActive && member.userId) {
      this.notification
        .notify({
          userId: member.userId,
          type: 'member_removed',
          title: `Removed from ${project.name}`,
          body: `You no longer have access to the project "${project.name}".`,
          metadata: { projectId },
        })
        .catch((error) => {
          this.logger.warn(
            { projectId, removedUserId: member.userId, err: error },
            'Failed to notify removed member',
          );
        });
    }

    return result;
  }

  /**
   * Resolves a project member row by `ProjectMember.id` (preferred) or active member `userId`.
   */
  private async resolveMemberForRemoval(projectId: string, memberIdOrUserId: string) {
    const byId = await this.projectRepo.findMemberById(memberIdOrUserId);
    if (byId?.projectId === projectId) {
      return byId;
    }
    return this.projectRepo.findMemberByProjectAndUserId(projectId, memberIdOrUserId);
  }

  async deleteProject(projectId: string, userId: string) {
    const isOwner = await this.projectRepo.isOwner(projectId, userId);
    if (!isOwner) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only project owner can delete project', 403);
    }

    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
    }

    await this.prisma.$transaction(async (tx) => {
      const meetings = await tx.meeting.findMany({
        where: { projectId },
        select: { id: true },
      });
      for (const meeting of meetings) {
        await tx.task.deleteMany({ where: { meetingId: meeting.id } });
        await tx.transcript.deleteMany({ where: { meetingId: meeting.id } });
        await tx.transcriptBlocker.deleteMany({ where: { meetingId: meeting.id } });
      }
      await tx.transcriptBlocker.deleteMany({ where: { projectId } });
      await tx.meeting.deleteMany({ where: { projectId } });
      await tx.project.delete({ where: { id: projectId } });
    });

    this.logger.log({ projectId, userId }, 'Project deleted');

    return { id: projectId, deleted: true };
  }

  async getProjectMembers(projectId: string, userId: string, page = 1, limit = 20) {
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
    const [rows, total] = await Promise.all([
      this.projectRepo.findMembersByProject(projectId, { skip, take: limit }),
      this.projectRepo.countMembersByProject(projectId),
    ]);
    const items = rows.map((row) => ({
      id: row.id,
      email: row.email,
      status: row.status,
      userId: row.userId ?? null,
      user: row.user
        ? {
            id: row.user.id,
            email: row.user.email,
            name: row.user.name,
            role: row.user.role,
          }
        : null,
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

    const owner = await this.userRepo.findById(project.ownerId);
    const memberRows = await this.projectRepo.findMembersByProject(projectId);
    const memberUserIds = [
      project.ownerId,
      ...memberRows.map((r) => r.userId).filter((id): id is string => !!id),
    ];
    const uniqueUserIds = [...new Set(memberUserIds)];

    const [githubAccounts, jiraAccounts] = await Promise.all([
      this.prisma.githubAccount.findMany({
        where: { userId: { in: uniqueUserIds } },
        select: { userId: true, username: true },
      }),
      this.prisma.jiraAccount.findMany({
        where: { userId: { in: uniqueUserIds } },
        select: { userId: true, accountId: true, displayName: true },
      }),
    ]);
    const githubByUser = new Map(githubAccounts.map((g) => [g.userId, g]));
    const jiraByUser = new Map(jiraAccounts.map((j) => [j.userId, j]));

    const mapIntegrationFlags = (uid: string, githubUsername: string | null) => {
      const gh = githubByUser.get(uid);
      const jr = jiraByUser.get(uid);
      const githubMapped = !!(githubUsername?.trim() || gh?.username?.trim());
      const jiraMapped = !!jr?.accountId?.trim();
      return { githubMapped, jiraMapped };
    };

    const membersWithRole = [
      ...(owner
        ? [
            {
              userId: owner.id,
              name: owner.name,
              email: owner.email,
              role: owner.role,
              githubUsername: owner.githubUsername ?? null,
              projectRole: 'owner' as const,
              status: 'ACTIVE' as const,
              ...mapIntegrationFlags(owner.id, owner.githubUsername),
            },
          ]
        : []),
      ...memberRows
        .filter((row) => row.userId !== project.ownerId)
        .map((row) => ({
          memberId: row.id,
          userId: row.userId ?? null,
          name: row.user?.name ?? null,
          email: row.email,
          role: row.user?.role ?? null,
          githubUsername: row.user?.githubUsername ?? null,
          projectRole: 'member' as const,
          status: row.status,
          ...(row.userId
            ? mapIntegrationFlags(row.userId, row.user?.githubUsername ?? null)
            : { githubMapped: false, jiraMapped: false }),
        })),
    ];

    const activeMembers = membersWithRole.filter((m) => m.status === 'ACTIVE');
    const integrationMapping = {
      totalActiveMembers: activeMembers.length,
      githubMappedCount: activeMembers.filter((m) => m.githubMapped).length,
      jiraMappedCount: activeMembers.filter((m) => m.jiraMapped).length,
      message:
        'Connect GitHub/Jira integrations or set githubUsername on profile. Jira requires OAuth + refresh-profile for accountId.',
    };

    const integrations = {
      github: parseGithubRepoUrl(project.githubRepoUrl ?? null),
      jira: {
        projectKey: project.jiraProjectKey ?? null,
        lastActivitySyncAt: project.jiraLastActivitySyncAt ?? null,
      },
    };

    return {
      project: { id: project.id, name: project.name },
      integrations,
      integrationMapping,
      members: membersWithRole,
    };
  }

  async getProjectDashboard(projectId: string, userId: string, filters: DashboardFilterDto = {}) {
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
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
            durationSeconds: true,
            participants: true,
          },
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
    const tasksCompleted = tasksApproved + tasksRejected + (taskCounts['SYNCED'] ?? 0);
    const tasksPending = (taskCounts['EXTRACTED'] ?? 0) + (taskCounts['SENT_TO_DEVELOPER'] ?? 0);
    const openBlockersCount = githubBlockersTotal + transcriptBlockersTotal;
    const sprintProgressPercent =
      totalTasks > 0 ? Math.round((tasksCompleted / totalTasks) * 100) : 0;

    return {
      project: { id: project.id, name: project.name },
      taskCountsByStatus: taskCounts,
      kpis: {
        totalTasks,
        tasksApproved,
        tasksRejected,
        tasksPending,
        tasksCompleted,
        sprintProgressPercent,
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

  /**
   * Developer dashboard: my tasks, recent meetings, blockers, sprint progress.
   * Accessible to project members (owner or member).
   */
  async getDeveloperDashboard(projectId: string, userId: string, filters: DashboardFilterDto = {}) {
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
      assigneeId: userId,
    };
    if (filters.fromDate || filters.toDate) {
      taskWhere.createdAt = {};
      if (filters.fromDate) taskWhere.createdAt.gte = new Date(filters.fromDate);
      if (filters.toDate) taskWhere.createdAt.lte = new Date(filters.toDate);
    }

    const meetingWhere: Prisma.MeetingWhereInput = { projectId };
    if (filters.fromDate || filters.toDate) {
      meetingWhere.createdAt = {};
      if (filters.fromDate) meetingWhere.createdAt.gte = new Date(filters.fromDate);
      if (filters.toDate) meetingWhere.createdAt.lte = new Date(filters.toDate);
    }

    const myTasksLimit = filters.recentTasksLimit ?? 10;
    const recentMeetingsLimit = filters.recentMeetingsLimit ?? 10;
    const blockersLimit = Math.min(filters.blockersLimit ?? 20, 50);

    const [
      taskCountsByStatus,
      myTasks,
      myTasksTotal,
      recentMeetings,
      recentMeetingsTotal,
      githubBlockers,
      transcriptBlockers,
    ] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['status'],
        _count: { id: true },
        where: { meeting: { projectId } },
      }),
      this.prisma.task.findMany({
        where: taskWhere,
        take: myTasksLimit,
        orderBy: { createdAt: 'desc' },
        include: {
          meeting: { select: { id: true, title: true } },
          assignee: { select: { id: true, email: true, name: true } },
        },
      }),
      this.prisma.task.count({ where: taskWhere }),
      this.prisma.meeting.findMany({
        where: meetingWhere,
        take: recentMeetingsLimit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          durationSeconds: true,
          participants: true,
        },
      }),
      this.prisma.meeting.count({ where: meetingWhere }),
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
      taskCountsByStatus.map((r: { status: string; _count: { id: number } }) => [
        r.status,
        r._count.id,
      ]),
    );
    const totalTasks = taskCountsByStatus.reduce(
      (s: number, r: { _count: { id: number } }) => s + r._count.id,
      0,
    );
    const tasksCompleted =
      (taskCounts['APPROVED'] ?? 0) + (taskCounts['REJECTED'] ?? 0) + (taskCounts['SYNCED'] ?? 0);
    const sprintProgressPercent =
      totalTasks > 0 ? Math.round((tasksCompleted / totalTasks) * 100) : 0;

    const mergedBlockers = [
      ...githubBlockers.map((b) => ({
        id: b.id,
        source: 'github' as const,
        createdAt: b.createdAt,
        message: b.message,
        type: b.type,
        pullRequest: b.pullRequest,
      })),
      ...transcriptBlockers.map((b) => ({
        id: b.id,
        source: 'transcript' as const,
        createdAt: b.createdAt,
        message: b.message,
        category: b.category,
        meeting: b.meeting,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      project: { id: project.id, name: project.name },
      kpis: {
        myTasksCount: myTasksTotal,
        sprintProgressPercent,
      },
      myTasks: {
        items: myTasks,
        total: myTasksTotal,
      },
      recentMeetings: {
        items: recentMeetings,
        total: recentMeetingsTotal,
      },
      blockers: {
        items: mergedBlockers,
        total: mergedBlockers.length,
      },
    };
  }

  /** Returns unified list of GitHub and transcript blockers for the project. Scrum Master only. */
  async getProjectBlockers(projectId: string, userId: string, filters: BlockersFilterDto = {}) {
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
    const githubWhere: Prisma.BlockerWhereInput = { projectId };
    const transcriptWhere: Prisma.TranscriptBlockerWhereInput = { projectId };
    if (filters.fromDate) {
      const from = new Date(filters.fromDate);
      githubWhere.createdAt = { gte: from };
      transcriptWhere.createdAt = { gte: from };
    }
    if (filters.category) transcriptWhere.category = filters.category;

    const wantGithub = filters.source !== 'transcript';
    const wantTranscript = filters.source !== 'github';

    const [githubBlockers, transcriptBlockers] = await Promise.all([
      wantGithub
        ? this.prisma.blocker.findMany({
            where: githubWhere,
            include: { pullRequest: true },
            orderBy: { createdAt: 'desc' },
          })
        : [],
      wantTranscript
        ? this.prisma.transcriptBlocker.findMany({
            where: transcriptWhere,
            include: { meeting: { select: { id: true, title: true } } },
            orderBy: { createdAt: 'desc' },
          })
        : [],
    ]);

    const merged = [
      ...githubBlockers.map((b) => ({
        id: b.id,
        source: 'github' as const,
        createdAt: b.createdAt,
        message: b.message,
        type: b.type,
        pullRequest: b.pullRequest,
      })),
      ...transcriptBlockers.map((b) => ({
        id: b.id,
        source: 'transcript' as const,
        createdAt: b.createdAt,
        message: b.message,
        category: b.category,
        meeting: b.meeting,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = merged.length;
    const items = merged.slice(skip, skip + limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}
