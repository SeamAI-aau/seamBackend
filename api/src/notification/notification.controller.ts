import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserType } from '../auth/types/current-user.type';
import { NotificationService } from './notification.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { NOTIFICATION_TYPES } from './constants/notification-types';

function toListFilters(query: NotificationQueryDto) {
  return {
    unreadOnly: query.unreadOnly,
    type: query.type,
    projectId: query.projectId,
    taskId: query.taskId,
    fromDate: query.fromDate,
    toDate: query.toDate,
    page: query.page ?? 1,
    limit: query.limit ?? 50,
  };
}

function toCountFilters(query: NotificationQueryDto) {
  return {
    type: query.type,
    projectId: query.projectId,
    taskId: query.taskId,
    fromDate: query.fromDate,
    toDate: query.toDate,
  };
}

const NOTIFICATION_TYPE_EXAMPLES = Object.values(NOTIFICATION_TYPES).join(', ');

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({
    summary: 'List notifications for the current user',
    description:
      'Returns paginated in-app notifications for the authenticated user only (from JWT `sub`). ' +
      'Optional query filters narrow results; `projectId` and `taskId` match JSON fields on `metadata`.',
  })
  @ApiQuery({
    name: 'unreadOnly',
    required: false,
    type: Boolean,
    description: 'When `true`, only notifications with `readAt` null.',
    example: true,
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: `Notification type. Examples: ${NOTIFICATION_TYPE_EXAMPLES}.`,
    example: NOTIFICATION_TYPES.TASK_ASSIGNED,
  })
  @ApiQuery({
    name: 'projectId',
    required: false,
    description: 'Filter where `metadata.projectId` equals this UUID (project-scoped inbox).',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiQuery({
    name: 'taskId',
    required: false,
    description: 'Filter where `metadata.taskId` equals this UUID.',
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  })
  @ApiQuery({
    name: 'fromDate',
    required: false,
    description: 'Include notifications created on or after this ISO 8601 datetime.',
    example: '2026-03-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'toDate',
    required: false,
    description: 'Include notifications created on or before this ISO 8601 datetime.',
    example: '2026-03-31T23:59:59.999Z',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (1-based). Defaults to 1.',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page. Defaults to 50, maximum 100.',
    example: 50,
  })
  @ApiOkResponse({
    description: 'Paginated notifications for the current user.',
    schema: {
      example: {
        items: [
          {
            id: 'notif_1',
            userId: 'user-uuid',
            type: 'task_assigned',
            title: 'New task: Fix payment retries',
            body: 'You have been assigned the task "Fix payment retries".',
            metadata: {
              taskId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
              projectId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            },
            readAt: null,
            createdAt: '2026-03-06T10:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      },
    },
  })
  getMyNotifications(@CurrentUser() user: CurrentUserType, @Query() query: NotificationQueryDto) {
    return this.notificationService.getForUser(user.userId, toListFilters(query));
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Get unread notifications count for the current user',
    description:
      'Counts only unread notifications (`readAt` is null) for the authenticated user. ' +
      'Supports the same metadata and date filters as the list endpoint (`type`, `projectId`, `taskId`, `fromDate`, `toDate`). ' +
      '`page` and `limit` are ignored if sent.',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: `Notification type. Examples: ${NOTIFICATION_TYPE_EXAMPLES}.`,
    example: NOTIFICATION_TYPES.TASK_ASSIGNED,
  })
  @ApiQuery({
    name: 'projectId',
    required: false,
    description: 'Count only notifications whose `metadata.projectId` matches.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiQuery({
    name: 'taskId',
    required: false,
    description: 'Count only notifications whose `metadata.taskId` matches.',
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  })
  @ApiQuery({
    name: 'fromDate',
    required: false,
    description: 'Count only notifications created on or after this ISO 8601 datetime.',
    example: '2026-03-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'toDate',
    required: false,
    description: 'Count only notifications created on or before this ISO 8601 datetime.',
    example: '2026-03-31T23:59:59.999Z',
  })
  @ApiOkResponse({
    description: 'Unread count after applying filters.',
    schema: { example: { count: 3 } },
  })
  getUnreadCount(@CurrentUser() user: CurrentUserType, @Query() query: NotificationQueryDto) {
    return this.notificationService
      .getUnreadCount(user.userId, toCountFilters(query))
      .then((count) => ({ count }));
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a single notification as read' })
  @ApiParam({ name: 'id', description: 'Notification UUID.' })
  @ApiOkResponse({
    description: 'Whether the notification was found and updated.',
    schema: { example: { success: true } },
  })
  markAsRead(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.notificationService.markAsRead(id, user.userId).then((ok) => ({ success: ok }));
  }

  @Patch('read-all')
  @ApiOperation({
    summary: 'Mark all notifications as read for current user',
    description: 'Marks every unread notification for the authenticated user as read (all projects).',
  })
  @ApiOkResponse({
    description: 'Number of notifications marked read.',
    schema: { example: { count: 12 } },
  })
  markAllAsRead(@CurrentUser() user: CurrentUserType) {
    return this.notificationService.markAllAsRead(user.userId);
  }
}
