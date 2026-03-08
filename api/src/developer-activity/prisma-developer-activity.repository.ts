import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  IDeveloperActivityRepository,
  UpsertDeveloperActivityInput,
  DeveloperActivityFilters,
  DeveloperActivityWithUser,
  ChartBucket,
} from './developer-activity.repository';

@Injectable()
export class PrismaDeveloperActivityRepository implements IDeveloperActivityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(data: UpsertDeveloperActivityInput): Promise<void> {
    if (!data.externalId) return;
    await this.prisma.developerActivity.upsert({
      where: {
        source_externalId: { source: data.source, externalId: data.externalId },
      },
      create: {
        projectId: data.projectId,
        userId: data.userId ?? undefined,
        source: data.source,
        type: data.type,
        externalId: data.externalId,
        title: data.title ?? undefined,
        metadata: data.metadata ?? undefined,
        occurredAt: data.occurredAt,
      },
      update: {
        title: data.title ?? undefined,
        metadata: data.metadata ?? undefined,
      },
    });
  }

  async findMany(
    filters: DeveloperActivityFilters,
    options?: { skip?: number; take?: number },
  ): Promise<DeveloperActivityWithUser[]> {
    const where: Record<string, unknown> = { projectId: filters.projectId };
    if (filters.userId) where.userId = filters.userId;
    if (filters.source) where.source = filters.source;
    if (filters.type) where.type = filters.type;
    if (filters.fromDate || filters.toDate) {
      where.occurredAt = {};
      if (filters.fromDate) (where.occurredAt as Record<string, Date>).gte = filters.fromDate;
      if (filters.toDate) (where.occurredAt as Record<string, Date>).lte = filters.toDate;
    }

    const rows = await this.prisma.developerActivity.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      skip: options?.skip,
      take: options?.take,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
    return rows as DeveloperActivityWithUser[];
  }

  async count(filters: DeveloperActivityFilters): Promise<number> {
    const where: Record<string, unknown> = { projectId: filters.projectId };
    if (filters.userId) where.userId = filters.userId;
    if (filters.source) where.source = filters.source;
    if (filters.type) where.type = filters.type;
    if (filters.fromDate || filters.toDate) {
      where.occurredAt = {};
      if (filters.fromDate) (where.occurredAt as Record<string, Date>).gte = filters.fromDate;
      if (filters.toDate) (where.occurredAt as Record<string, Date>).lte = filters.toDate;
    }
    return this.prisma.developerActivity.count({ where });
  }

  async getChartData(
    projectId: string,
    fromDate: Date,
    toDate: Date,
    groupBy: 'day' | 'week',
    userId?: string,
  ): Promise<ChartBucket[]> {
    const where: Record<string, unknown> = {
      projectId,
      occurredAt: { gte: fromDate, lte: toDate },
    };
    if (userId) where.userId = userId;

    const activities = await this.prisma.developerActivity.findMany({
      where,
      select: { type: true, occurredAt: true, metadata: true },
    });

    const buckets = new Map<string, { count: number; byType: Record<string, number> }>();

    const formatKey = (d: Date) => {
      if (groupBy === 'week') {
        const start = new Date(d);
        start.setDate(start.getDate() - start.getDay());
        return start.toISOString().slice(0, 10);
      }
      return d.toISOString().slice(0, 10);
    };

    for (const a of activities) {
      const key = formatKey(a.occurredAt);
      if (!buckets.has(key)) {
        buckets.set(key, { count: 0, byType: {} });
      }
      const b = buckets.get(key)!;
      const inc = a.type === 'commit_count' ? (a.metadata as { count?: number })?.count ?? 0 : 1;
      b.count += inc;
      if (a.type === 'commit_count') {
        b.byType['commit'] = (b.byType['commit'] ?? 0) + inc;
      } else {
        b.byType[a.type] = (b.byType[a.type] ?? 0) + 1;
      }
    }

    const sorted = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { count, byType }]) => ({ date, count, byType }));

    return sorted;
  }
}
