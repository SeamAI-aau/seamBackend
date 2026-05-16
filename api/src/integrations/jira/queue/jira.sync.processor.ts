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
    this.logger.log(`Jira sync job started taskId=${taskId} jobId=${job.id}`);
    try {
      await this.jiraSyncService.syncTaskToJira(taskId);
      this.logger.log(`Jira sync job finished taskId=${taskId}`);
    } catch (err) {
      this.logger.warn(
        `Jira sync job error taskId=${taskId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }
}
