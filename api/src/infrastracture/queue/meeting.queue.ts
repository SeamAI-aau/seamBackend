import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Logger } from 'nestjs-pino';

@Injectable()
export class MeetingProducer {
  constructor(
    @InjectQueue('meeting-transcription')
    private readonly queue: Queue,
    private readonly logger: Logger,
  ) {}

  async enqueue(meetingId: string, audioUrl: string) {
    await this.queue.add(
      'transcribe',
      { meetingId, audioUrl },
      {
        jobId: meetingId, // prevents duplicate jobs
      },
    );

    this.logger.info(
      { meetingId },
      'Meeting transcription job enqueued',
    );
  }
}
