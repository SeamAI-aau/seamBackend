import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { IDeveloperActivityRepository } from './developer-activity.repository';
import { DEVELOPER_ACTIVITY_REPOSITORY } from './developer-activity.tokens';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';

@Injectable()
export class DeveloperActivityService {
  constructor(
    @Inject(DEVELOPER_ACTIVITY_REPOSITORY)
    private readonly activityRepo: IDeveloperActivityRepository,
    private readonly prisma: PrismaService,
  ) {}

  async getActivityFeed(
    projectId: string,
    userId: string,
    filters: {
      source?: 'GITHUB' | 'JIRA';
      userId?: string;
      fromDate?: string;
      toDate?: string;
      page?: number;
      limit?: number;
    },
  ) {
    await this.ensureProjectAccess(projectId, userId);

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 100);
    const skip = (page - 1) * limit;

    const filterInput = {
      projectId,
      userId: filters.userId,
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
    userId: string,
    filters: {
      fromDate?: string;
      toDate?: string;
      groupBy?: 'day' | 'week';
      userId?: string;
    },
  ) {
    await this.ensureProjectAccess(projectId, userId);

    const toDate = filters.toDate ? new Date(filters.toDate) : new Date();
    const fromDate = filters.fromDate
      ? new Date(filters.fromDate)
      : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const groupBy = filters.groupBy ?? 'day';

    return this.activityRepo.getChartData(projectId, fromDate, toDate, groupBy, filters.userId);
  }

  private async ensureProjectAccess(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        ownerId: true,
        members: { where: { userId, status: 'ACTIVE' }, take: 1 },
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
  }
}
