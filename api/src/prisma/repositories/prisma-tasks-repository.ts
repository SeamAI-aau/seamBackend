import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  ITaskRepository,
  TaskFilters,
  TaskWithMeetingAndProject,
  TaskWithMeetingAndAssignee,
  TaskWithMeetingProject,
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

  async findByIdWithProject(taskId: string): Promise<TaskWithMeetingProject | null> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        meeting: {
          include: {
            project: true,
          },
        },
      },
    });
    return task as TaskWithMeetingProject | null;
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
      data: { status },
    });
  }

  async markAsCreatedInJira(taskId: string, jiraIssueKey: string) {
    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        jiraIssueKey,
        status: TaskStatus.SYNCED,
      },
    });
  }

  async updateAssigneeAndStatus(
    id: string,
    assigneeId: string,
    status: TaskStatus,
  ) {
    return this.prisma.task.update({
      where: { id, },
      data: { status, assigneeId },
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

  async findManyWithMeetingAndAssignee(
    filters: TaskFilters,
  ): Promise<TaskWithMeetingAndAssignee[]> {
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

    const rows = await this.prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        meeting: { select: { id: true, title: true } },
        assignee: { select: { id: true, email: true, name: true } },
      },
    });
    return rows as TaskWithMeetingAndAssignee[];
  }
}
