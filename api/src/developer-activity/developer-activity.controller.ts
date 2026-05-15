import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserType } from '../auth/types/current-user.type';
import { DeveloperActivityService } from './developer-activity.service';
import { DeveloperActivitySyncService } from './developer-activity-sync.service';
import {
  DeveloperActivityQueryDto,
  DeveloperActivityChartQueryDto,
} from './dto/developer-activity-query.dto';
import { JiraActivitySyncQueryDto } from './dto/jira-activity-sync-query.dto';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';

@ApiTags('Developer Activity')
@ApiBearerAuth('access-token')
@Controller('developer-activity')
@UseGuards(JwtAuthGuard)
export class DeveloperActivityController {
  constructor(
    private readonly activityService: DeveloperActivityService,
    private readonly syncService: DeveloperActivitySyncService,
  ) {}

  @Get('projects/:projectId/feed')
  @ApiOperation({
    summary: 'Get developer activity feed for a project',
    description:
      'Paginated feed of GitHub and Jira activity. Jira types include jira_status_change, jira_assignee_change, jira_comment, jira_worklog, jira_issue_created.',
  })
  @ApiParam({ name: 'projectId', description: 'Project UUID.' })
  @ApiOkResponse({
    description: 'Paginated activity feed.',
    schema: {
      example: {
        items: [
          {
            id: 'act-uuid',
            source: 'JIRA',
            type: 'jira_status_change',
            title: 'PAY-42: Webhook retries',
            metadata: { issueKey: 'PAY-42', from: 'To Do', to: 'In Progress' },
            occurredAt: '2026-04-14T10:00:00.000Z',
            user: { id: 'user-uuid', name: 'Dev One', email: 'dev@example.com' },
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Not a project member.' })
  @ApiNotFoundResponse({ description: 'Project not found.' })
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
  @ApiOperation({ summary: 'Get developer activity chart buckets for a project' })
  @ApiParam({ name: 'projectId', description: 'Project UUID.' })
  @ApiOkResponse({
    schema: {
      example: [{ date: '2026-04-14', count: 5, byType: { jira_status_change: 2, commit: 3 } }],
    },
  })
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
  @ApiOperation({
    summary: 'Sync GitHub developer activity',
    description:
      'Uses project owner GitHub token. Maps commits/PRs to members with githubUsername or GitHub OAuth.',
  })
  @ApiOkResponse({ schema: { example: { commits: 12, prs: 5 } } })
  async syncGitHub(@Param('projectId') projectId: string, @CurrentUser() user: CurrentUserType) {
    return this.syncService.syncGitHubActivity(projectId, user.userId);
  }

  @Post('sync/projects/:projectId/jira')
  @ApiOperation({
    summary: 'Sync Jira developer activity',
    description:
      'Pulls changelog (status + assignee), comments, worklogs, and issue-created events. ' +
      'Uses project owner Jira token. Attributes activity to members who connected Jira (accountId on JiraAccount). ' +
      'Incremental: defaults fromDate to last sync or 30 days ago. Updates project.jiraLastActivitySyncAt.',
  })
  @ApiParam({ name: 'projectId', description: 'Project UUID.' })
  @ApiOkResponse({
    description: 'Sync summary.',
    schema: { example: { activities: 48, issuesScanned: 25 } },
  })
  async syncJira(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserType,
    @Query() query: JiraActivitySyncQueryDto,
  ) {
    return this.syncService.syncJiraActivity(projectId, user.userId, query);
  }
}
