import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserType } from '../auth/types/current-user.type';
import { DeveloperActivityService } from './developer-activity.service';
import { DeveloperActivitySyncService } from './developer-activity-sync.service';
import {
  DeveloperActivityQueryDto,
  DeveloperActivityChartQueryDto,
} from './dto/developer-activity-query.dto';

@Controller('developer-activity')
@UseGuards(JwtAuthGuard)
export class DeveloperActivityController {
  constructor(
    private readonly activityService: DeveloperActivityService,
    private readonly syncService: DeveloperActivitySyncService,
  ) {}

  @Get('projects/:projectId/feed')
  getFeed(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserType,
    @Query() query: DeveloperActivityQueryDto,
  ) {
    return this.activityService.getActivityFeed(projectId, user.userId, {
      source: query.source,
      userId: query.userId,
      fromDate: query.fromDate,
      toDate: query.toDate,
      page: query.page ?? 1,
      limit: query.limit ?? 50,
    });
  }

  @Get('projects/:projectId/charts')
  getCharts(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserType,
    @Query() query: DeveloperActivityChartQueryDto,
  ) {
    return this.activityService.getChartData(projectId, user.userId, {
      fromDate: query.fromDate,
      toDate: query.toDate,
      groupBy: query.groupBy ?? 'day',
      userId: query.userId,
    });
  }

  @Post('sync/projects/:projectId/github')
  async syncGitHub(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.syncService.syncGitHubActivity(projectId, user.userId);
  }

  @Post('sync/projects/:projectId/jira')
  async syncJira(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.syncService.syncJiraActivity(projectId, user.userId);
  }
}
