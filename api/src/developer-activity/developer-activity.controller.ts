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
      externalId: 'jira:PAY-42:10001:status',
      title: 'PAY-42: Implement webhook retries',
      metadata: { issueKey: 'PAY-42', field: 'status', from: 'To Do', to: 'In Progress' },
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
      'Paginated feed of synced GitHub and Jira activity (newest first). ' +
      'Developers always receive only their own rows (userId query is ignored except own id). ' +
      'Scrum Masters may omit userId for the whole team or filter to one member. ' +
      'GitHub types: commit_count, pr_opened, pr_merged. ' +
      'Jira types: jira_status_change, jira_assignee_change, jira_comment, jira_worklog, jira_issue_created.',
  })
  @ApiParam({
    name: 'projectId',
    description: 'Project UUID.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiOkResponse({
    description:
      'Paginated activity feed. user is null when activity could not be mapped to a project member.',
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
    return this.activityService.getActivityFeed(projectId, user, {
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
      'Time-series buckets for charts. commit_count uses metadata.count; other types count as 1. ' +
      'byType breaks down per activity type (commit maps from commit_count). ' +
      'Default range is last 30 days when fromDate is omitted. No request body.',
  })
  @ApiParam({
    name: 'projectId',
    description: 'Project UUID.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiOkResponse({
    description: 'Chart buckets sorted by date ascending.',
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
    return this.activityService.getChartData(projectId, user, {
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
      'Pulls commits (last 30 days) from the linked repo and PRs from the local DB, then upserts DeveloperActivity. ' +
      'Uses project owner GitHub token. Only mapped members (githubUsername or GitHub OAuth) are attributed. ' +
      'No request body. Returns { commits: 0, prs: 0 } when githubRepoUrl is not set.',
  })
  @ApiParam({
    name: 'projectId',
    description: 'Project UUID.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiOkResponse({
    description: 'Rows upserted for commit-day aggregates and PR activity.',
    schema: { example: { commits: 12, prs: 5 } },
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
      'Pulls Jira changelog (status + assignee), comments, worklogs, and issue-created events. ' +
      'Uses project owner Jira token. Attributes via JiraAccount.accountId on owner and active members. ' +
      'Query: optional fromDate, toDate, maxIssues. Incremental default uses last sync or 30 days. ' +
      'Updates project.jiraLastActivitySyncAt. Returns { activities: 0, issuesScanned: 0 } when jiraProjectKey is unset.',
  })
  @ApiParam({
    name: 'projectId',
    description: 'Project UUID.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiOkResponse({
    description: 'activities = rows upserted; issuesScanned = Jira issues processed.',
    schema: { example: { activities: 48, issuesScanned: 25 } },
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
  async syncJira(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserType,
    @Query() query: JiraActivitySyncQueryDto,
  ) {
    return this.syncService.syncJiraActivity(projectId, user.userId, query);
  }
}
