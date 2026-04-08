import { Module } from '@nestjs/common';
import { ActivityLogController } from './activity-log.controller';
import { ActivityLogService } from './activity-log.service';
import { ACTIVITY_LOG_REPOSITORY } from './activity-log.tokens';
import { PrismaActivityLogRepository } from './prisma-activity-log.repository';

@Module({
  controllers: [ActivityLogController],
  providers: [
    ActivityLogService,
    {
      provide: ACTIVITY_LOG_REPOSITORY,
      useClass: PrismaActivityLogRepository,
    },
  ],
  exports: [ActivityLogService],
})
export class ActivityLogModule {}
