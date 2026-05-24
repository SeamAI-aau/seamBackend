import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  INotificationRepository,
  CreateNotificationInput,
  NotificationFilters,
  NotificationWithUser,
} from './notification.repository';

function buildNotificationWhere(filters: NotificationFilters): Prisma.NotificationWhereInput {
  const where: Prisma.NotificationWhereInput = { userId: filters.userId };

  if (filters.unreadOnly) {
    where.readAt = null;
  }
  if (filters.type) {
    where.type = filters.type;
  }
  if (filters.fromDate || filters.toDate) {
    where.createdAt = {};
    if (filters.fromDate) where.createdAt.gte = filters.fromDate;
    if (filters.toDate) where.createdAt.lte = filters.toDate;
  }

  const metadataFilters: Prisma.NotificationWhereInput[] = [];
  if (filters.projectId) {
    metadataFilters.push({
      metadata: { path: ['projectId'], equals: filters.projectId },
    });
  }
  if (filters.taskId) {
    metadataFilters.push({
      metadata: { path: ['taskId'], equals: filters.taskId },
    });
  }
  if (metadataFilters.length > 0) {
    const existingAnd = where.AND
      ? Array.isArray(where.AND)
        ? where.AND
        : [where.AND]
      : [];
    where.AND = [...existingAnd, ...metadataFilters];
  }

  return where;
}

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
    const rows = await this.prisma.notification.findMany({
      where: buildNotificationWhere(filters),
      orderBy: { createdAt: 'desc' },
      skip: options?.skip,
      take: options?.take,
    });
    return rows as NotificationWithUser[];
  }

  async count(filters: NotificationFilters): Promise<number> {
    return this.prisma.notification.count({
      where: buildNotificationWhere(filters),
    });
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

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.prisma.notification.deleteMany({
      where: { id, userId },
    });
    return result.count > 0;
  }
}
