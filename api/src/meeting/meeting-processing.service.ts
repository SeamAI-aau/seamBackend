import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from 'nestjs-pino';
import { MeetingStatus, TaskStatus } from '@prisma/client';
import { WorkerResultPayload } from './dto/workersResultPayload';

@Injectable()
export class MeetingProcessingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  async handleWorkerResult(
    meetingId: string,
    payload: WorkerResultPayload,
  ): Promise<void> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    // Idempotency check
    if (meeting.status === MeetingStatus.TASKS_EXTRACTED) {
      this.logger.warn({ meetingId }, 'Meeting already processed');
      return;
    }

    if (!payload.transcript || !Array.isArray(payload.tasks)) {
      throw new Error('Invalid worker payload');
    }

    await this.prisma.$transaction(async (tx) => {
      // 1️⃣ Set PROCESSING
      await tx.meeting.update({
        where: { id: meetingId },
        data: { status: MeetingStatus.PROCESSING },
      });

      // 2️⃣ Determine next transcript version
      const latest = await tx.transcript.findFirst({
        where: { meetingId },
        orderBy: { version: 'desc' },
      });

      const nextVersion = latest ? latest.version + 1 : 1;

      // 3️⃣ Create transcript
      const transcript = await tx.transcript.create({
        data: {
          meetingId,
          version: nextVersion,
          content: payload.transcript,
          diarization: payload.diarization,
        },
      });

      // 4️⃣ Create tasks (batch insert is better)
      if (payload.tasks.length > 0) {
        await tx.task.createMany({
          data: payload.tasks.map((task) => ({
            title: task.title,
            description: task.description,
            meetingId,
            transcriptId: transcript.id,
            status: TaskStatus.EXTRACTED,
            assigneeId: task.assigneeId ?? null,
            // Remove confidenceScore if not in schema
          })),
        });
      }

      // 5️⃣ Final status
      await tx.meeting.update({
        where: { id: meetingId },
        data: { status: MeetingStatus.TASKS_EXTRACTED },
      });
    });

    this.logger.log({ meetingId }, 'Transcript and tasks saved');
  }
}