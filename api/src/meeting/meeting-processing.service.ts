import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from 'nestjs-pino';
import { MeetingStatus, TaskStatus } from '@prisma/client';
import { CloudinaryService } from '../infrastracture/cloudinary/cloudinary.service';
import type { WorkerResultPayload } from './dto/worker-result.dto';
import { WORKER_RESULT_STATUS_SUCCESS } from './constants/meeting.constants';

/**
 * Handles persistence of worker results: transcript + extracted tasks,
 * or marks meeting as FAILED when the worker reports an error.
 * After successful transcription, deletes the meeting recording from Cloudinary
 * for security and storage (the Meeting record is kept).
 */
@Injectable()
export class MeetingProcessingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly logger: Logger,
  ) {}

  async handleWorkerResult(meetingId: string, payload: WorkerResultPayload): Promise<void> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      this.logger.warn({ meetingId }, 'Worker result for unknown meeting');
      throw new Error('Meeting not found');
    }

    if (meeting.status === MeetingStatus.TASKS_EXTRACTED) {
      this.logger.warn({ meetingId }, 'Meeting already processed; skipping');
      return;
    }

    const isFailure =
      payload.status !== WORKER_RESULT_STATUS_SUCCESS ||
      (payload.error != null && payload.error !== '');

    if (isFailure) {
      await this.prisma.meeting.update({
        where: { id: meetingId },
        data: { status: MeetingStatus.FAILED },
      });
      this.logger.warn(
        { meetingId, error: payload.error },
        'Meeting processing failed; status set to FAILED',
      );
      return;
    }

    if (
      typeof payload.transcript !== 'string' ||
      !Array.isArray(payload.tasks)
    ) {
      await this.prisma.meeting.update({
        where: { id: meetingId },
        data: { status: MeetingStatus.FAILED },
      });
      this.logger.warn(
        { meetingId },
        'Invalid worker payload: missing transcript or tasks array',
      );
      return;
    }

    await this.persistTranscriptAndTasks(meetingId, payload);
    this.logger.log({ meetingId }, 'Transcript and tasks saved');

    await this.deleteRecordingFromCloudinary(meetingId, meeting.audioPublicId);
  }

  /**
   * Deletes the meeting recording file from Cloudinary after successful transcription.
   * The Meeting record is kept; only the audio asset is removed for security and storage.
   */
  private async deleteRecordingFromCloudinary(
    meetingId: string,
    audioPublicId: string | null,
  ): Promise<void> {
    if (!audioPublicId?.trim()) return;
    try {
      await this.cloudinaryService.deleteByPublicId(audioPublicId);
      this.logger.log({ meetingId }, 'Meeting recording deleted from Cloudinary');
    } catch (err) {
      this.logger.warn(
        { meetingId, publicId: audioPublicId, err },
        'Failed to delete meeting recording from Cloudinary; meeting and transcript are saved',
      );
    }
  }

  private async persistTranscriptAndTasks(
    meetingId: string,
    payload: WorkerResultPayload,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const meeting = await tx.meeting.findUnique({
        where: { id: meetingId },
        select: { projectId: true },
      });
      if (!meeting) return;

      await tx.meeting.update({
        where: { id: meetingId },
        data: { status: MeetingStatus.PROCESSING },
      });

      const latest = await tx.transcript.findFirst({
        where: { meetingId },
        orderBy: { version: 'desc' },
      });
      const nextVersion = latest ? latest.version + 1 : 1;

      const transcript = await tx.transcript.create({
        data: {
          meetingId,
          version: nextVersion,
          content: payload.transcript!,
          diarization: payload.diarization ?? {},
        },
      });

      if (payload.tasks!.length > 0) {
        await tx.task.createMany({
          data: payload.tasks!.map((task) => ({
            meetingId,
            transcriptId: transcript.id,
            title: task.title,
            description: task.description ?? null,
            status: TaskStatus.EXTRACTED,
            assigneeId: task.assigneeId ?? null,
          })),
        });
      }

      const blockers = payload.blockers ?? [];
      if (blockers.length > 0) {
        await tx.transcriptBlocker.createMany({
          data: blockers.map((b) => ({
            meetingId,
            projectId: meeting.projectId,
            category: b.category ?? null,
            message: b.message,
          })),
        });
      }

      await tx.meeting.update({
        where: { id: meetingId },
        data: { status: MeetingStatus.TASKS_EXTRACTED },
      });
    });
  }
}
