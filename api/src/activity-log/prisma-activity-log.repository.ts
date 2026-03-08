import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  IActivityLogRepository,
  CreateActivityLogInput,
  ActivityLogFilters,
  ActivityLogWithRelations,
} from './activity-log.repository';

@Injectable()
export class PrismaActivityLogRepository implements IActivityLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateActivityLogInput) {
    const log = await this.prisma.activityLog.create({
      data: {
        projectId: data.projectId ?? undefined,
        userId: data.userId ?? undefined,
        action: data.action,
        entityType: data.entityType ?? undefined,
        entityId: data.entityId ?? undefined,
        metadata: data.metadata ?? undefined,
      },
      select: { id: true, createdAt: true },
    });
    return log;
  }

  async findMany(
    filters: ActivityLogFilters,
    options?: { skip?: number; take?: number },
  ): Promise<ActivityLogWithRelations[]> {
    const where: Record<string, unknown> = {};
    if (filters.projectId) where.projectId = filters.projectId;
    if (filters.userId) where.userId = filters.userId;
    if (filters.action) where.action = filters.action;
    if (filters.fromDate || filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) (where.createdAt as Record<string, Date>).gte = filters.fromDate;
      if (filters.toDate) (where.createdAt as Record<string, Date>).lte = filters.toDate;
    }

    const rows = await this.prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: options?.skip,
      take: options?.take,
      include: {
        project: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
    return rows as ActivityLogWithRelations[];
  }

  async count(filters: ActivityLogFilters): Promise<number> {
    const where: Record<string, unknown> = {};
    if (filters.projectId) where.projectId = filters.projectId;
    if (filters.userId) where.userId = filters.userId;
    if (filters.action) where.action = filters.action;
    if (filters.fromDate || filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) (where.createdAt as Record<string, Date>).gte = filters.fromDate;
      if (filters.toDate) (where.createdAt as Record<string, Date>).lte = filters.toDate;
    }
    return this.prisma.activityLog.count({ where });
  }
}
