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

  async uploadMeeting(projectId: string, userId: string, file: Express.Multer.File) {
    const project = await this.projectRepo.findById(projectId);

    if (!project) {
      throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
    }

    if (project.ownerId !== userId) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only owner can upload meeting', 403);
    }

    const { secure_url, url } = await this.cloudinaryService.uploadAudio(file);
    const audioUrl = secure_url ?? url;

    if (!audioUrl) {
      throw new AppException(
        ErrorCode.CLOUDINARY_UPLOAD_FAILED,
        'Cloudinary did not return an audio URL',
        500,
      );
    }

    const meeting = await this.meetingRepo.create({
      title: `Meeting - ${new Date().toISOString()}`,
      audioUrl,
      projectId,
    });

    await this.meetingProducer.enqueue(meeting.id, meeting.audioUrl);

    this.logger.log({ meetingId: meeting.id }, 'Meeting uploaded and enqueued');

    return { id: meeting.id };
  }
}
