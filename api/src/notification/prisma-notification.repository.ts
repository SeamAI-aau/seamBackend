import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  INotificationRepository,
  CreateNotificationInput,
  NotificationFilters,
  NotificationWithUser,
} from './notification.repository';

@Injectable()
export class PrismaNotificationRepository implements INotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateNotificationInput): Promise<NotificationWithUser> {
    const n = await this.prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        metadata: data.metadata ?? undefined,
      },
    });
    return n as NotificationWithUser;
  }

  async findMany(
    filters: NotificationFilters,
    options?: { skip?: number; take?: number },
  ): Promise<NotificationWithUser[]> {
    const where: Record<string, unknown> = { userId: filters.userId };
    if (filters.unreadOnly) where.readAt = null;
    if (filters.type) where.type = filters.type;
    if (filters.fromDate || filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) (where.createdAt as Record<string, Date>).gte = filters.fromDate;
      if (filters.toDate) (where.createdAt as Record<string, Date>).lte = filters.toDate;
    }

    const rows = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: options?.skip,
      take: options?.take,
    });
    return rows as NotificationWithUser[];
  }

  async count(filters: NotificationFilters): Promise<number> {
    const where: Record<string, unknown> = { userId: filters.userId };
    if (filters.unreadOnly) where.readAt = null;
    if (filters.type) where.type = filters.type;
    if (filters.fromDate || filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) (where.createdAt as Record<string, Date>).gte = filters.fromDate;
      if (filters.toDate) (where.createdAt as Record<string, Date>).lte = filters.toDate;
    }
    return this.prisma.notification.count({ where });
  }

  async markAsRead(id: string, userId: string): Promise<boolean> {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    return result.count > 0;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }
}
