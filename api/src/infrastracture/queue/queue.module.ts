import { Module } from '@nestjs/common';
import { MeetingQueue } from './meeting.queue';

@Module({
  providers: [MeetingQueue],
  exports: [MeetingQueue],
})
export class QueueModule {}
