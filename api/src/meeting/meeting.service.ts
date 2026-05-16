import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { NotificationService } from '../notification/notification.service';
import { Logger } from 'nestjs-pino';

import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { CloudinaryService } from '../infrastracture/cloudinary/cloudinary.service';
import { MeetingAiDispatchService } from './meeting-ai-dispatch.service';
import type { IMeetingRepository } from './types/meeting.repository';
import { MEETING_REPOSITORY } from './types/meeting.token';
import type { IProjectRepository } from '../project/types/project.repository';
import { PROJECT_REPOSITORY } from '../project/types/project.tokens';

@Injectable()
export class MeetingService {
  constructor(
    @Inject(MEETING_REPOSITORY)
    private readonly meetingRepo: IMeetingRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: IProjectRepository,
    private readonly cloudinaryService: CloudinaryService,
    private readonly meetingAiDispatch: MeetingAiDispatchService,
    private readonly logger: Logger,
    private readonly activityLog: ActivityLogService,
    private readonly notification: NotificationService,
    private readonly prisma: PrismaService,
  ) {}

  async uploadMeeting(
    projectId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<{ id: string }> {
    await this.ensureProjectOwner(projectId, userId);

    const { url: audioUrl, publicId: audioPublicId } =
      await this.cloudinaryService.uploadMeetingAudio(file, {
        folderPrefix: projectId,
      });

    const meeting = await this.meetingRepo.create({
      title: `Meeting - ${new Date().toISOString()}`,
      audioUrl,
      audioPublicId,
      projectId,
      createdById: userId,
    });

    if (!this.meetingAiDispatch.isAiEngineEnabled()) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Meeting processing is not configured: set AI_ENGINE_BASE_URL to your ai-engine-2 base URL.',
        400,
      );
    }

    await this.meetingAiDispatch.dispatchMeetingAudio({
      meetingId: meeting.id,
      projectId,
      audioUrl: meeting.audioUrl,
    });

    this.activityLog
      .log({
        projectId,
        userId,
        action: 'meeting.uploaded',
        entityType: 'Meeting',
        entityId: meeting.id,
        metadata: { title: meeting.title },
      })
      .catch(() => {
        // ignore activity log errors
      });

    this.notification
      .notify({
        userId,
        type: 'meeting_uploaded',
        title: 'Meeting uploaded',
        body: `A meeting recording was uploaded and sent for processing.`,
        metadata: { meetingId: meeting.id, projectId },
      })
      .catch(() => {
        // ignore notification errors
      });

    this.logger.log({ meetingId: meeting.id }, 'Meeting uploaded and dispatched to AI engine');

    return { id: meeting.id };
  }

  async listByProject(projectId: string, userId: string, page = 1, limit = 20) {
    await this.ensureProjectAccess(projectId, userId);
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.meetingRepo.findByProjectWithTaskCount(projectId, { skip, take: limit }),
      this.meetingRepo.countByProject(projectId),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  async getByIdWithDetails(projectId: string, meetingId: string, userId: string) {
    await this.ensureProjectAccess(projectId, userId);

    const meeting = await this.meetingRepo.findByIdWithTranscriptsAndTasks(meetingId);

    if (!meeting) {
      throw new AppException(ErrorCode.MEETING_NOT_FOUND, 'Meeting not found', 404);
    }

    if (meeting.projectId !== projectId) {
      throw new AppException(ErrorCode.MEETING_NOT_FOUND, 'Meeting not found', 404);
    }

    return meeting;
  }

  async deleteMeeting(projectId: string, meetingId: string, userId: string) {
    await this.ensureProjectAccess(projectId, userId);

    const meeting = await this.meetingRepo.findById(meetingId);
    if (!meeting || meeting.projectId !== projectId) {
      throw new AppException(ErrorCode.MEETING_NOT_FOUND, 'Meeting not found', 404);
    }

    const isOwner = await this.projectRepo.isOwner(projectId, userId);
    if (!isOwner && meeting.createdById !== userId) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Only project owner or meeting uploader can delete this meeting',
        403,
      );
    }

    if (meeting.audioPublicId?.trim()) {
      try {
        await this.cloudinaryService.deleteByPublicId(meeting.audioPublicId);
      } catch (err) {
        this.logger.warn(
          { meetingId, publicId: meeting.audioPublicId, err },
          'Failed to delete meeting audio from Cloudinary before DB delete',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.task.deleteMany({ where: { meetingId } });
      await tx.transcript.deleteMany({ where: { meetingId } });
      await tx.transcriptBlocker.deleteMany({ where: { meetingId } });
      await tx.meeting.delete({ where: { id: meetingId } });
    });

    this.activityLog
      .log({
        projectId,
        userId,
        action: 'meeting.deleted',
        entityType: 'Meeting',
        entityId: meetingId,
        metadata: { title: meeting.title },
      })
      .catch(() => undefined);

    this.logger.log({ meetingId, projectId, userId }, 'Meeting deleted');

    return { id: meetingId, deleted: true };
  }

  private async ensureProjectOwner(projectId: string, userId: string): Promise<void> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
    }
    if (project.ownerId !== userId) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only owner can upload meeting', 403);
    }
  }

  private async ensureProjectAccess(projectId: string, userId: string): Promise<void> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
    }
    const isOwner = await this.projectRepo.isOwner(projectId, userId);
    const isMember = await this.projectRepo.isMember(projectId, userId);
    if (!isOwner && !isMember) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Access denied', 403);
    }
  }
}
