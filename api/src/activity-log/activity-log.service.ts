import { Inject, Injectable } from '@nestjs/common';
import type {
  IActivityLogRepository,
  CreateActivityLogInput,
  ActivityLogFilters,
} from './activity-log.repository';
import { ACTIVITY_LOG_REPOSITORY } from './activity-log.tokens';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';

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
    userId: string,
    filters: { action?: string; fromDate?: string; toDate?: string; page?: number; limit?: number },
  ) {
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

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 100);
    const skip = (page - 1) * limit;

    const filterInput: ActivityLogFilters = {
      projectId,
      action: filters.action,
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

  async getMyActivity(
    userId: string,
    filters: { action?: string; fromDate?: string; toDate?: string; page?: number; limit?: number },
  ) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 100);
    const skip = (page - 1) * limit;

    const filterInput: ActivityLogFilters = {
      userId,
      action: filters.action,
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
}
