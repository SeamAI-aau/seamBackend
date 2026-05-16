import { Inject, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import type {
  IActivityLogRepository,
  CreateActivityLogInput,
  ActivityLogFilters,
} from './activity-log.repository';
import { ACTIVITY_LOG_REPOSITORY } from './activity-log.tokens';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import type { CurrentUserType } from '../auth/types/current-user.type';

export type ActivityLogListQuery = {
  projectId?: string;
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
};

@Injectable()
export class ActivityLogService {
  constructor(
    @Inject(ACTIVITY_LOG_REPOSITORY)
    private readonly activityRepo: IActivityLogRepository,
    private readonly prisma: PrismaService,
  ) {}

  async log(data: CreateActivityLogInput): Promise<void> {
    await this.activityRepo.create(data);
  }

  async getProjectActivity(
    projectId: string,
    user: CurrentUserType,
    filters: ActivityLogListQuery,
  ) {
    const access = await this.assertProjectActivityAccess(projectId, user.userId);

    const filterUserId = await this.resolveProjectActivityUserIdFilter(
      projectId,
      access,
      user,
      filters.userId,
    );

    return this.listActivity({
      projectId,
      userId: filterUserId,
      action: filters.action,
      entityType: filters.entityType,
      entityId: filters.entityId,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      page: filters.page,
      limit: filters.limit,
    });
  }

  async getMyActivity(user: CurrentUserType, filters: ActivityLogListQuery) {
    if (filters.userId && filters.userId !== user.userId) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Cannot filter another user on /activity-log/my',
        403,
      );
    }

    if (filters.projectId) {
      await this.assertProjectActivityAccess(filters.projectId, user.userId);
    }

    return this.listActivity({
      userId: user.userId,
      projectId: filters.projectId,
      action: filters.action,
      entityType: filters.entityType,
      entityId: filters.entityId,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      page: filters.page,
      limit: filters.limit,
    });
  }

  private async listActivity(filters: ActivityLogListQuery & { userId?: string }) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 100);
    const skip = (page - 1) * limit;

    const filterInput: ActivityLogFilters = {
      projectId: filters.projectId,
      userId: filters.userId,
      action: filters.action,
      entityType: filters.entityType,
      entityId: filters.entityId,
    };
    if (filters.fromDate) filterInput.fromDate = new Date(filters.fromDate);
    if (filters.toDate) filterInput.toDate = new Date(filters.toDate);

    const [items, total] = await Promise.all([
      this.activityRepo.findMany(filterInput, { skip, take: limit }),
      this.activityRepo.count(filterInput),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  private async assertProjectActivityAccess(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        ownerId: true,
        members: { where: { userId, status: 'ACTIVE' }, take: 1, select: { userId: true } },
      },
    });
    if (!project) {
      throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
    }
    const isOwner = project.ownerId === userId;
    const isMember = project.members.length > 0;
    if (!isOwner && !isMember) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Access denied', 403);
    }
    return { ownerId: project.ownerId, isOwner, isMember };
  }

  private async resolveProjectActivityUserIdFilter(
    projectId: string,
    access: { ownerId: string; isOwner: boolean; isMember: boolean },
    user: CurrentUserType,
    requestedUserId?: string,
  ): Promise<string | undefined> {
    if (!requestedUserId) return undefined;

    const canFilterOthers =
      access.isOwner ||
      (user.role === Role.SCRUM_MASTER && (access.isOwner || access.isMember));

    if (!canFilterOthers && requestedUserId !== user.userId) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Developers may only filter activity by their own user id',
        403,
      );
    }

    if (requestedUserId === access.ownerId) {
      return requestedUserId;
    }

    const member = await this.prisma.projectMember.findFirst({
      where: {
        projectId,
        userId: requestedUserId,
        status: 'ACTIVE',
      },
      select: { userId: true },
    });
    if (!member) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'userId must be the project owner or an active member',
        400,
      );
    }

    return requestedUserId;
  }
}
