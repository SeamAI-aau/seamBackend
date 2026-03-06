import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { JiraSyncService } from '../jira-sync.service';
import type { JiraSyncJobData } from './jira-sync-job.data';

@Processor('jira-sync')
export class JiraSyncProcessor extends WorkerHost {
  constructor(private readonly jiraSyncService: JiraSyncService) {
    super();
  }

  async process(job: Job<JiraSyncJobData, void, string>): Promise<void> {
    const { taskId } = job.data;
    await this.jiraSyncService.syncTaskToJira(taskId);
  }
}