import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserType } from '../auth/types/current-user.type';
import { ActivityLogService } from './activity-log.service';
import { ActivityLogQueryDto } from './dto/activity-log-query.dto';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiQuery,
  ApiParam,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';

const EXAMPLE_PROJECT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const EXAMPLE_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const EXAMPLE_TASK_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const EXAMPLE_LOG_ID = 'd4e5f6a7-b8c9-0123-def0-234567890123';

const ACTIVITY_LOG_PAGE_EXAMPLE = {
  items: [
    {
      id: EXAMPLE_LOG_ID,
      projectId: EXAMPLE_PROJECT_ID,
      userId: EXAMPLE_USER_ID,
      action: 'task.approved',
      entityType: 'Task',
      entityId: EXAMPLE_TASK_ID,
      metadata: { title: 'Implement retry backoff' },
      createdAt: '2026-05-14T15:30:00.000Z',
      project: { id: EXAMPLE_PROJECT_ID, name: 'Payments Squad' },
      user: {
        id: EXAMPLE_USER_ID,
        name: 'Jane Doe',
        email: 'jane@example.com',
      },
    },
    {
      id: 'e5f6a7b8-c9d0-1234-ef01-345678901234',
      projectId: EXAMPLE_PROJECT_ID,
      userId: EXAMPLE_USER_ID,
      action: 'meeting.uploaded',
      entityType: 'Meeting',
      entityId: 'f6a7b8c9-d0e1-2345-f012-456789012345',
      metadata: { title: 'Meeting - 2026-05-14T12:00:00.000Z' },
      createdAt: '2026-05-14T12:05:00.000Z',
      project: { id: EXAMPLE_PROJECT_ID, name: 'Payments Squad' },
      user: {
        id: EXAMPLE_USER_ID,
        name: 'Jane Doe',
        email: 'jane@example.com',
      },
    },
  ],
  total: 2,
  page: 1,
  limit: 50,
  totalPages: 1,
};

function toListQuery(query: ActivityLogQueryDto) {
  return {
    projectId: query.projectId,
    userId: query.userId,
    action: query.action,
    entityType: query.entityType,
    entityId: query.entityId,
    fromDate: query.fromDate,
    toDate: query.toDate,
    page: query.page ?? 1,
    limit: query.limit ?? 50,
  };
}

@ApiTags('Activity Log')
@ApiBearerAuth('access-token')
@Controller('activity-log')
@UseGuards(JwtAuthGuard)
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get('projects/:projectId')
  @ApiOperation({
    summary: 'List activity for a project',
    description:
      'Returns paginated audit events for the project. Optional `userId` filters to one actor: ' +
      'project owner and Scrum Masters on the project may filter any member; developers may only use their own id.',
  })
  @ApiParam({
    name: 'projectId',
    description: 'Project UUID.',
    example: EXAMPLE_PROJECT_ID,
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    description:
      'Filter by actor. Developers may only pass their own id; owner/Scrum Master may pass any project member id.',
    example: EXAMPLE_USER_ID,
  })
  @ApiQuery({ name: 'action', required: false, example: 'task.approved' })
  @ApiQuery({ name: 'entityType', required: false, example: 'Task' })
  @ApiQuery({ name: 'entityId', required: false, example: EXAMPLE_TASK_ID })
  @ApiQuery({ name: 'fromDate', required: false, example: '2026-05-01T00:00:00.000Z' })
  @ApiQuery({ name: 'toDate', required: false, example: '2026-05-31T23:59:59.999Z' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiOkResponse({
    description: 'Paginated activity log entries for the project.',
    schema: { example: ACTIVITY_LOG_PAGE_EXAMPLE },
  })
  @ApiForbiddenResponse({
    description: 'No project access or invalid userId filter for role.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Developers may only filter activity by their own user id',
        error: 'FORBIDDEN',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Project not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Project not found',
        error: 'PROJECT_NOT_FOUND',
      },
    },
  })
  getProjectActivity(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserType,
    @Query() query: ActivityLogQueryDto,
  ) {
    return this.activityLogService.getProjectActivity(projectId, user, toListQuery(query));
  }

  @Get('my')
  @ApiOperation({
    summary: 'List activity for the current user',
    description:
      'Always scoped to the authenticated user. Optional `projectId` narrows to one project (membership required).',
  })
  @ApiQuery({
    name: 'projectId',
    required: false,
    description: 'Filter to a single project the user belongs to.',
    example: EXAMPLE_PROJECT_ID,
  })
  @ApiQuery({ name: 'action', required: false, example: 'task.assigned' })
  @ApiQuery({ name: 'entityType', required: false, example: 'Task' })
  @ApiQuery({ name: 'entityId', required: false, example: EXAMPLE_TASK_ID })
  @ApiQuery({ name: 'fromDate', required: false, example: '2026-05-01T00:00:00.000Z' })
  @ApiQuery({ name: 'toDate', required: false, example: '2026-05-31T23:59:59.999Z' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiOkResponse({
    description: 'Paginated activity log entries for the current user.',
    schema: { example: ACTIVITY_LOG_PAGE_EXAMPLE },
  })
  @ApiForbiddenResponse({
    description: 'No access to the requested project.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Access denied',
        error: 'FORBIDDEN',
      },
    },
  })
  getMyActivity(@CurrentUser() user: CurrentUserType, @Query() query: ActivityLogQueryDto) {
    return this.activityLogService.getMyActivity(user, toListQuery(query));
  }
}
