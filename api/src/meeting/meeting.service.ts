import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { CloudinaryService } from '../infrastracture/cloudinary/cloudinary.service';
import { MeetingProducer } from '../infrastracture/queue/meeting.producer';
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
    private readonly meetingProducer: MeetingProducer,
    private readonly logger: Logger,
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
    });

    await this.meetingProducer.enqueue(meeting.id, meeting.audioUrl);

    this.logger.log({ meetingId: meeting.id }, 'Meeting uploaded and enqueued');

    return { id: meeting.id };
  }

  async listByProject(projectId: string, userId: string) {
    await this.ensureProjectAccess(projectId, userId);
    return this.meetingRepo.findByProjectWithTaskCount(projectId);
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
