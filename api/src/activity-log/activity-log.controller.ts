import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserType } from '../auth/types/current-user.type';
import { ActivityLogService } from './activity-log.service';
import { ActivityLogQueryDto } from './dto/activity-log-query.dto';
import {
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Activity Log')
@ApiBearerAuth('access-token')
@Controller('activity-log')
@UseGuards(JwtAuthGuard)
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get('projects/:projectId')
  getProjectActivity(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserType,
    @Query() query: ActivityLogQueryDto,
  ) {
    return this.activityLogService.getProjectActivity(projectId, user.userId, {
      action: query.action,
      fromDate: query.fromDate,
      toDate: query.toDate,
      page: query.page ?? 1,
      limit: query.limit ?? 50,
    });
  }

  @Get('my')
  getMyActivity(
    @CurrentUser() user: CurrentUserType,
    @Query() query: ActivityLogQueryDto,
  ) {
    return this.activityLogService.getMyActivity(user.userId, {
      action: query.action,
      fromDate: query.fromDate,
      toDate: query.toDate,
      page: query.page ?? 1,
      limit: query.limit ?? 50,
    });
  }
}
