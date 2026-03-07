import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Logger } from 'nestjs-pino';
import {
  MEETING_JOB_TRANSCRIBE,
  MEETING_TRANSCRIPTION_QUEUE_NAME,
} from '../../meeting/constants/meeting.constants';

@Injectable()
export class MeetingProducer {
  constructor(
    @InjectQueue(MEETING_TRANSCRIPTION_QUEUE_NAME)
    private readonly queue: Queue,
    private readonly logger: Logger,
  ) {}

  async enqueue(meetingId: string, audioUrl: string) {
    await this.queue.add(
      MEETING_JOB_TRANSCRIBE,
      { meetingId, audioUrl },
      {
        jobId: meetingId, // prevents duplicate jobs
      },
    );

    this.logger.log({ meetingId }, 'Meeting transcription job enqueued');
  }
}
