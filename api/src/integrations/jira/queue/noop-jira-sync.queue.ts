import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class NoopJiraSyncQueue {
  private readonly logger = new Logger(NoopJiraSyncQueue.name);

  async enqueue(taskId: string): Promise<string> {
    this.logger.warn(
      `DISABLE_QUEUES=true — dropped jira-sync for taskId=${taskId}. ` +
        'Jira tickets will not be created until queues are enabled (set DISABLE_QUEUES=false and configure Redis).',
    );
    return 'noop';
  }
}
