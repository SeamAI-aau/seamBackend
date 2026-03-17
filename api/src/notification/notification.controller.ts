import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
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
} from '@nestjs/swagger';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the current user' })
  @ApiOkResponse({
    description: 'Paginated notifications.',
    schema: {
      example: {
        items: [
          {
            id: 'notif_1',
            type: 'task_assigned',
            title: 'New task: Fix payment retries',
            body: 'You have been assigned the task \"Fix payment retries\".',
            metadata: { taskId: 'task_1', projectId: 'proj_1' },
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
  getMyNotifications(
    @CurrentUser() user: CurrentUserType,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notificationService.getForUser(user.userId, {
      unreadOnly: query.unreadOnly,
      type: query.type,
      fromDate: query.fromDate,
      toDate: query.toDate,
      page: query.page ?? 1,
      limit: query.limit ?? 50,
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notifications count for current user' })
  getUnreadCount(@CurrentUser() user: CurrentUserType) {
    return this.notificationService.getUnreadCount(user.userId).then((count) => ({ count }));
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a single notification as read' })
  markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.notificationService.markAsRead(id, user.userId).then((ok) => ({ success: ok }));
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read for current user' })
  markAllAsRead(@CurrentUser() user: CurrentUserType) {
    return this.notificationService.markAllAsRead(user.userId);
  }
}
