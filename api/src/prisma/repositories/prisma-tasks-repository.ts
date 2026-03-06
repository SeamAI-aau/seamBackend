import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type { ITaskRepository, TaskWithMeetingProject } from '../../tasks/task.repository';
import { TaskStatus } from '@prisma/client';

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
}
