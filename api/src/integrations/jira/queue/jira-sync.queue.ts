import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class JiraSyncQueue {
  constructor(
    @InjectQueue('jira-sync')
    private readonly queue: Queue,
  ) {}

  async enqueue(taskId: string) {
    await this.queue.add(
      'create-ticket',
      { taskId },
      {
        jobId: `jira-sync:${taskId}`,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: { age: 3600, count: 200 },
        removeOnFail: { age: 7 * 24 * 3600, count: 500 },
      },
    );
  }
}
