import {
  BadRequestException,
  Controller,
  Post,
  Param,
  Body,
  Headers,
  HttpCode,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeSecretEqual } from '../common/utils/timing-safe-secret.util';
import { PrismaService } from '../prisma/prisma.service';
import { TaskStatus } from '@prisma/client';

const WORKER_SECRET_HEADER = 'x-worker-secret';

/**
 * Internal API for system-generated project blockers (CI failures, task inactivity).
 * Not protected by JWT; uses the same shared secret header as the meeting worker.
 */
@Controller('internal/projects')
export class InternalProjectBlockersController {
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {}

  @Post(':id/blockers/ci-failure')
  @HttpCode(200)
  async createCiFailureBlocker(
    @Param('id') projectId: string,
    @Body() body: { message: string },
    @Headers(WORKER_SECRET_HEADER) secret: string | undefined,
  ): Promise<{ message: string }> {
    this.ensureSecret(secret);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (!body?.message || body.message.trim().length === 0) {
      throw new BadRequestException('message is required');
    }

    await this.prisma.transcriptBlocker.create({
      data: {
        projectId,
        meetingId: null,
        category: 'ci_failure',
        message: body.message,
      },
    });

    return { message: 'Created' };
  }

  @Post(':id/blockers/task-inactivity')
  @HttpCode(200)
  async createTaskInactivityBlockers(
    @Param('id') projectId: string,
    @Body() body: { daysInactive: number },
    @Headers(WORKER_SECRET_HEADER) secret: string | undefined,
  ): Promise<{ created: number }> {
    this.ensureSecret(secret);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const days = body?.daysInactive;
    if (!Number.isInteger(days) || days <= 0) {
      throw new BadRequestException('daysInactive must be a positive integer');
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const tasks = await this.prisma.task.findMany({
      where: {
        status: TaskStatus.SENT_TO_DEVELOPER,
        updatedAt: { lt: cutoff },
        meeting: { projectId },
      },
      include: {
        assignee: true,
      },
    });

    if (tasks.length === 0) {
      return { created: 0 };
    }

    await this.prisma.transcriptBlocker.createMany({
      data: tasks.map((task) => {
        const assigneeLabel = task.assignee?.name || task.assignee?.email || 'developer';

        return {
          projectId,
          meetingId: null,
          category: 'task_inactivity',
          message: `Task "${task.title}" assigned to ${assigneeLabel} has been inactive for ${days} days.`,
        };
      }),
    });

    return { created: tasks.length };
  }

  private ensureSecret(secret: string | undefined): void {
    const expected = this.config.get<string>('WORKER_SECRET');

    if (!expected) {
      throw new BadRequestException('Worker secret not configured');
    }

    if (!timingSafeSecretEqual(secret, expected)) {
      throw new BadRequestException('Invalid worker secret');
    }
  }
}
