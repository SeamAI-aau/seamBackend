import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { JiraSyncService } from '../jira-sync.service';
import type { JiraSyncJobData } from './jira-sync-job.data';

@Processor('jira-sync')
export class JiraSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(JiraSyncProcessor.name);

  constructor(private readonly jiraSyncService: JiraSyncService) {
    super();
  }

  async process(job: Job<JiraSyncJobData, void, string>): Promise<void> {
    const { taskId } = job.data;
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 1;
    this.logger.log(
      `[jira-sync] job started taskId=${taskId} jobId=${job.id} attempt=${attempt}/${maxAttempts}`,
    );
    try {
      await this.jiraSyncService.syncTaskToJira(taskId);
      this.logger.log(`[jira-sync] job finished taskId=${taskId} jobId=${job.id}`);
    } catch (err) {
      this.logger.warn(
        `[jira-sync] job error taskId=${taskId} jobId=${job.id} attempt=${attempt}/${maxAttempts}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    }
  }
}
