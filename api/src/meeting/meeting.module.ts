import { Module } from '@nestjs/common';
import { MeetingController } from './meeting.controller';
import { InternalMeetingController } from './internal-meeting.controller';
import { MeetingService } from './meeting.service';
import { MeetingProcessingService } from './meeting-processing.service';
import { MEETING_REPOSITORY } from './types/meeting.token';
import { PrismaMeetingRepository } from '../prisma/repositories/prisma-meeting.repository';
import { ProjectModule } from '../project/project.module';
import { QueueModule } from '../infrastracture/queue/queue.module';
import { CloudinaryModule } from '../infrastracture/cloudinary/cloudinary.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';

@Module({
  imports: [ProjectModule, QueueModule, CloudinaryModule, ActivityLogModule],
  controllers: [MeetingController, InternalMeetingController],
  providers: [
    MeetingService,
    MeetingProcessingService,
    {
      provide: MEETING_REPOSITORY,
      useClass: PrismaMeetingRepository,
    },
  ],
})
export class MeetingModule {}
