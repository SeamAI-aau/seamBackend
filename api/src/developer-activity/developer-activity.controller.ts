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

const ACTIVITY_FEED_EXAMPLE = {
  items: [
    {
      id: 'act-uuid-1',
      projectId: 'proj-uuid',
      userId: 'user-uuid',
      source: 'GITHUB',
      type: 'commit_count',
      externalId: 'commit_agg:proj-uuid:user-uuid:2026-04-15',
      title: null,
      metadata: { count: 5, repo: 'acme/payments-api' },
      occurredAt: '2026-04-15T00:00:00.000Z',
      user: { id: 'user-uuid', name: 'Dev One', email: 'dev1@example.com' },
    },
    {
      id: 'act-uuid-2',
      projectId: 'proj-uuid',
      userId: 'user-uuid',
      source: 'GITHUB',
      type: 'pr_opened',
      externalId: 'pr:12345',
      title: 'Add retry backoff for webhooks',
      metadata: { author: 'dev-one', state: 'OPEN' },
      occurredAt: '2026-04-14T16:30:00.000Z',
      user: { id: 'user-uuid', name: 'Dev One', email: 'dev1@example.com' },
    },
    {
      id: 'act-uuid-3',
      projectId: 'proj-uuid',
      userId: 'user-uuid',
      source: 'JIRA',
      type: 'jira_status_change',
      externalId: 'jira:PAY-42:10001',
      title: 'PAY-42: Implement webhook retries',
      metadata: { issueKey: 'PAY-42', from: 'To Do', to: 'In Progress' },
      occurredAt: '2026-04-14T10:00:00.000Z',
      user: { id: 'user-uuid', name: 'Dev One', email: 'dev1@example.com' },
    },
  ],
  total: 42,
  page: 1,
  limit: 50,
  totalPages: 1,
};

const CHART_DATA_EXAMPLE = [
  { date: '2026-04-10', count: 3, byType: { commit: 2, pr_opened: 1 } },
  { date: '2026-04-11', count: 7, byType: { commit: 5, jira_status_change: 2 } },
  { date: '2026-04-12', count: 1, byType: { pr_merged: 1 } },
];

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
      'Paginated feed of synced GitHub and Jira activity for the project. ' +
      'Activity types include commit_count (daily aggregated commits), pr_opened, pr_merged, and jira_status_change. ' +
      'Requires project owner or active member access. No request body.',
  })
  @ApiParam({
    name: 'projectId',
    description: 'Project UUID.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiOkResponse({
    description:
      'Paginated activity feed ordered by occurredAt descending. ' +
      'user is null when the activity could not be mapped to a project member.',
    schema: { example: ACTIVITY_FEED_EXAMPLE },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
    schema: {
      example: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' },
    },
  })
  @ApiForbiddenResponse({
    description: 'Caller is not a project owner or active member.',
    schema: {
      example: { statusCode: 403, message: 'Access denied', error: 'Forbidden' },
    },
  })
  @ApiNotFoundResponse({
    description: 'Project not found.',
    schema: {
      example: { statusCode: 404, message: 'Project not found', error: 'Not Found' },
    },
  })
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
  @ApiOperation({
    summary: 'Get developer activity chart data for a project',
    description:
      'Time-series buckets of activity counts for charts. ' +
      'commit_count rows use metadata.count for totals; other types count as 1 per row. ' +
      'byType breaks down counts per activity type (commit maps from commit_count). ' +
      'Default range is the last 30 days when fromDate is omitted. No request body.',
  })
  @ApiParam({
    name: 'projectId',
    description: 'Project UUID.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiOkResponse({
    description: 'Array of chart buckets sorted by date ascending.',
    schema: { example: CHART_DATA_EXAMPLE },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
    schema: {
      example: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' },
    },
  })
  @ApiForbiddenResponse({
    description: 'Caller is not a project owner or active member.',
    schema: {
      example: { statusCode: 403, message: 'Access denied', error: 'Forbidden' },
    },
  })
  @ApiNotFoundResponse({
    description: 'Project not found.',
    schema: {
      example: { statusCode: 404, message: 'Project not found', error: 'Not Found' },
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
    summary: 'Sync GitHub developer activity for a project',
    description:
      'Pulls commits from the linked GitHub repo (last 30 days) and PRs from the local database, ' +
      'then upserts DeveloperActivity rows. Commits are aggregated per developer per day (type commit_count). ' +
      'Only commits/PRs authored by mapped project members (GitHub username on user or githubAccount) are stored. ' +
      'Returns counts of rows upserted. No request body. Returns { commits: 0, prs: 0 } when the project has no githubRepoUrl.',
  })
  @ApiParam({
    name: 'projectId',
    description: 'Project UUID.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiOkResponse({
    description: 'Number of commit-day aggregates and PR activity rows upserted.',
    schema: {
      example: { commits: 12, prs: 5 },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
    schema: {
      example: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' },
    },
  })
  @ApiForbiddenResponse({
    description: 'Caller is not a project owner or active member.',
    schema: {
      example: { statusCode: 403, message: 'Access denied', error: 'Forbidden' },
    },
  })
  @ApiNotFoundResponse({
    description: 'Project not found.',
    schema: {
      example: { statusCode: 404, message: 'Project not found', error: 'Not Found' },
    },
  })
  async syncGitHub(@Param('projectId') projectId: string, @CurrentUser() user: CurrentUserType) {
    return this.syncService.syncGitHubActivity(projectId, user.userId);
  }

  @Post('sync/projects/:projectId/jira')
  @ApiOperation({
    summary: 'Sync Jira developer activity for a project',
    description:
      'Fetches recent issues for the linked Jira project key and stores status transition changelog entries ' +
      '(type jira_status_change). Only transitions where the changelog field is status are recorded. ' +
      'No request body. Returns { issues: 0 } when the project has no jiraProjectKey.',
  })
  @ApiParam({
    name: 'projectId',
    description: 'Project UUID.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiOkResponse({
    description: 'Number of Jira status-change activity rows upserted.',
    schema: {
      example: { issues: 18 },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
    schema: {
      example: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' },
    },
  })
  @ApiForbiddenResponse({
    description: 'Caller is not a project owner or active member.',
    schema: {
      example: { statusCode: 403, message: 'Access denied', error: 'Forbidden' },
    },
  })
  @ApiNotFoundResponse({
    description: 'Project not found.',
    schema: {
      example: { statusCode: 404, message: 'Project not found', error: 'Not Found' },
    },
  })
  async syncJira(@Param('projectId') projectId: string, @CurrentUser() user: CurrentUserType) {
    return this.syncService.syncJiraActivity(projectId, user.userId);
  }
}
