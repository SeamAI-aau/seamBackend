import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { IDeveloperActivityRepository } from './developer-activity.repository';
import { DEVELOPER_ACTIVITY_REPOSITORY } from './developer-activity.tokens';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import type { CurrentUserType } from '../auth/types/current-user.type';
import {
  resolvePerformanceActivityUserId,
  type ProjectActivityAccess,
} from '../common/utils/activity-access.util';

@Injectable()
export class DeveloperActivityService {
  constructor(
    @Inject(DEVELOPER_ACTIVITY_REPOSITORY)
    private readonly activityRepo: IDeveloperActivityRepository,
    private readonly prisma: PrismaService,
  ) {}

  async getActivityFeed(
    projectId: string,
    user: CurrentUserType,
    filters: {
      source?: 'GITHUB' | 'JIRA';
      userId?: string;
      fromDate?: string;
      toDate?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const access = await this.assertProjectAccess(projectId, user.userId);
    const scopedUserId = resolvePerformanceActivityUserId(user, access, filters.userId);
    await this.validateScopedMember(projectId, access.ownerId, scopedUserId);

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 100);
    const skip = (page - 1) * limit;

    const filterInput = {
      projectId,
      userId: scopedUserId,
      source: filters.source,
      fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
      toDate: filters.toDate ? new Date(filters.toDate) : undefined,
    };

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

  async getChartData(
    projectId: string,
    user: CurrentUserType,
    filters: {
      fromDate?: string;
      toDate?: string;
      groupBy?: 'day' | 'week';
      userId?: string;
    },
  ) {
    const access = await this.assertProjectAccess(projectId, user.userId);
    const scopedUserId = resolvePerformanceActivityUserId(user, access, filters.userId);
    await this.validateScopedMember(projectId, access.ownerId, scopedUserId);

    const toDate = filters.toDate ? new Date(filters.toDate) : new Date();
    const fromDate = filters.fromDate
      ? new Date(filters.fromDate)
      : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const groupBy = filters.groupBy ?? 'day';

    return this.activityRepo.getChartData(
      projectId,
      fromDate,
      toDate,
      groupBy,
      scopedUserId,
    );
  }

  private async assertProjectAccess(
    projectId: string,
    userId: string,
  ): Promise<ProjectActivityAccess> {
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

  private async validateScopedMember(
    projectId: string,
    ownerId: string,
    scopedUserId?: string,
  ): Promise<void> {
    if (!scopedUserId) {
      return;
    }
    if (scopedUserId === ownerId) {
      return;
    }
    const member = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: scopedUserId, status: 'ACTIVE' },
      select: { userId: true },
    });
    if (!member) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'userId must be the project owner or an active member',
        400,
      );
    }
  }
}
