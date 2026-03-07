import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type {
  ITaskRepository,
  TaskFilters,
  TaskWithMeetingAndProject,
} from '../../tasks/types/task.repository';
import { TaskStatus, Prisma } from '@prisma/client';

@Injectable()
export class PrismaTaskRepository implements ITaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.task.findUnique({
      where: { id },
    });
  }

  async findByIdWithMeetingAndProject(
    id: string,
  ): Promise<TaskWithMeetingAndProject | null> {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        meeting: { include: { project: true } },
      },
    });
    return task as TaskWithMeetingAndProject | null;
  }

  async updateStatus(id: string, status: TaskStatus) {
    return this.prisma.task.update({
      where: { id },
      data: {
        status,
      },
    });
  }

  async updateAssigneeAndStatus(
    id: string,
    assigneeId: string,
    status: TaskStatus,
  ) {
    return this.prisma.task.update({
      where: { id },
      data: {
        assigneeId,
        status,
      },
    });
  }

  async findMany(filters: TaskFilters) {
    const where: Prisma.TaskWhereInput = {};

    if (filters.meetingId) {
      where.meetingId = filters.meetingId;
    }

    if (filters.projectId) {
      where.meeting = { projectId: filters.projectId };
    }

    if (filters.assigneeId) {
      where.assigneeId = filters.assigneeId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    return this.prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }
}
