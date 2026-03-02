import { AppException } from "../common/errors/app.exception";
import { ErrorCode } from "../common/errors/error-codes";
import { Inject, Injectable } from "@nestjs/common";
import { type IMeetingRepository } from "./types/meeting.repository";
import { MEETING_REPOSITORY } from "../meeting/types/meeting.token";
import { type IProjectRepository } from "../project/types/project.repository";
import { CloudinaryService } from "../infrastracture/cloudinary/cloudinary.service";
import { Logger } from 'nestjs-pino';
import { MeetingProducer } from "../infrastracture/queue/meeting.queue";

@Injectable()
export class MeetingService {
  constructor(
    @Inject(MEETING_REPOSITORY)
    private readonly meetingRepo: IMeetingRepository,
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

  const uploaded = await this.cloudinaryService.uploadAudio(file);

  const meeting = await this.meetingRepo.create({
    title: `Meeting - ${new Date().toISOString()}`,
    audioUrl: uploaded.secure_url,
    projectId,
  });

  await this.meetingProducer.enqueue(meeting.id, meeting.audioUrl);

  this.logger.info({ meetingId: meeting.id }, 'Meeting uploaded and enqueued');

  return { id: meeting.id };
}

}
