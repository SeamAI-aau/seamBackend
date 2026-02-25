import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

@Injectable()
export class MeetingQueue {
  private queue: Queue;

  constructor() {
    const connection = new IORedis({
      host: 'localhost',
      port: 6379,
    });

    this.queue = new Queue('meeting-transcription', {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });
  }

  async enqueue(meetingId: string, audioUrl: string) {
    await this.queue.add('transcribe', {
      meetingId,
      audioUrl,
    });
  }
}
