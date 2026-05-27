import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class JiraSyncQueue {
  private readonly logger = new Logger(JiraSyncQueue.name);

  constructor(
    @InjectQueue('jira-sync')
    private readonly queue: Queue,
  ) {}

  async enqueue(taskId: string): Promise<string> {
    const job = await this.queue.add(
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
    const jobId = job.id ?? `jira-sync:${taskId}`;
    this.logger.log(`[jira-sync] enqueued taskId=${taskId} jobId=${jobId}`);
    return jobId;
  }
}
