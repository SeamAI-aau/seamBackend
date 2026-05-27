import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  ITaskRepository,
  TaskFilters,
  TaskWithMeetingAndAssignee,
  TaskWithMeetingAndProject,
} from '../../tasks/types/task.repository';
import { TaskStatus, Prisma } from '@prisma/client';

const taskWithProjectInclude = {
  project: true,
  meeting: { select: { id: true, title: true } },
} as const;

@Injectable()
export class PrismaTaskRepository implements ITaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.task.findUnique({
      where: { id },
    });
  }

  async findByIdWithProject(taskId: string): Promise<TaskWithMeetingAndProject | null> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: taskWithProjectInclude,
    });
    return task as TaskWithMeetingAndProject | null;
  }

  async findByIdWithMeetingAndProject(id: string): Promise<TaskWithMeetingAndProject | null> {
    return this.findByIdWithProject(id);
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
        jiraSyncLastError: null,
      },
    });
  }

  async setJiraSyncLastError(taskId: string, message: string | null) {
    return this.prisma.task.update({
      where: { id: taskId },
      data: { jiraSyncLastError: message },
    });
  }

  async updateAssigneeAndStatus(id: string, assigneeId: string, status: TaskStatus) {
    return this.prisma.task.update({
      where: { id },
      data: { status, assigneeId },
    });
  }

  async clearAssigneeAndStatus(id: string, status: TaskStatus) {
    return this.prisma.task.update({
      where: { id },
      data: { status, assigneeId: null },
    });
  }

  async findMany(filters: TaskFilters) {
    return this.prisma.task.findMany({
      where: this.buildWhere(filters),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findManyWithMeetingAndAssignee(
    filters: TaskFilters,
    options?: { skip?: number; take?: number },
  ): Promise<TaskWithMeetingAndAssignee[]> {
    const rows = await this.prisma.task.findMany({
      where: this.buildWhere(filters),
      orderBy: { createdAt: 'desc' },
      skip: options?.skip,
      take: options?.take,
      include: {
        project: { select: { id: true, name: true } },
        meeting: { select: { id: true, title: true } },
        assignee: { select: { id: true, email: true, name: true } },
      },
    });
    return rows as TaskWithMeetingAndAssignee[];
  }

  async count(filters: TaskFilters): Promise<number> {
    return this.prisma.task.count({ where: this.buildWhere(filters) });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.task.delete({ where: { id } });
  }

  private buildWhere(filters: TaskFilters): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = {};
    if (filters.meetingId) where.meetingId = filters.meetingId;
    if (filters.projectId) where.projectId = filters.projectId;
    if (filters.assigneeId) where.assigneeId = filters.assigneeId;
    if (filters.status) where.status = filters.status;
    return where;
  }
}
