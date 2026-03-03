import { Module } from '@nestjs/common';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';
import { MEETING_REPOSITORY } from './types/meeting.token';
import { PrismaMeetingRepository } from '../prisma/repositories/prisma-meeting.repository';
import { ProjectModule } from '../project/project.module';
import { QueueModule } from '../infrastracture/queue/queue.module';
import { CloudinaryModule } from '../infrastracture/cloudinary/cloudinary.module';

@Module({
  imports: [ProjectModule, QueueModule, CloudinaryModule],
  controllers: [MeetingController],
  providers: [
    MeetingService,
    {
      provide: MEETING_REPOSITORY,
      useClass: PrismaMeetingRepository,
    },
  ],
})
export class MeetingModule {}
