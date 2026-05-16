import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GithubModule } from '../../integrations/github/github.module';
import { SchedulingBootstrapService } from './scheduling-bootstrap.service';

/**
 * Central entry for background schedules (BullMQ repeatables).
 * Add new repeatable registrations to `SchedulingBootstrapService`.
 */
@Module({
  imports: [ConfigModule, GithubModule],
  providers: [SchedulingBootstrapService],
})
export class SchedulingModule {}
