import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  IActivityLogRepository,
  CreateActivityLogInput,
  ActivityLogFilters,
  ActivityLogWithRelations,
} from './activity-log.repository';

function buildActivityLogWhere(filters: ActivityLogFilters): Prisma.ActivityLogWhereInput {
  const where: Prisma.ActivityLogWhereInput = {};

  if (filters.projectId) where.projectId = filters.projectId;
  if (filters.userId) where.userId = filters.userId;
  if (filters.action) where.action = filters.action;
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;

  if (filters.fromDate || filters.toDate) {
    where.createdAt = {};
    if (filters.fromDate) where.createdAt.gte = filters.fromDate;
    if (filters.toDate) where.createdAt.lte = filters.toDate;
  }

  return where;
}

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
    const rows = await this.prisma.activityLog.findMany({
      where: buildActivityLogWhere(filters),
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
    return this.prisma.activityLog.count({
      where: buildActivityLogWhere(filters),
    });
  }
}
