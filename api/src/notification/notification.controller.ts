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

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
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
  getUnreadCount(@CurrentUser() user: CurrentUserType) {
    return this.notificationService.getUnreadCount(user.userId).then((count) => ({ count }));
  }

  @Patch(':id/read')
  markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.notificationService.markAsRead(id, user.userId).then((ok) => ({ success: ok }));
  }

  @Patch('read-all')
  markAllAsRead(@CurrentUser() user: CurrentUserType) {
    return this.notificationService.markAllAsRead(user.userId);
  }
}
