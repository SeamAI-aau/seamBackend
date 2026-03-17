import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NOTIFICATION_REPOSITORY } from './notification.tokens';
import { PrismaNotificationRepository } from './prisma-notification.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../infrastracture/mail/mail.module';
import { RealtimeModule } from '../infrastracture/realtime/realtime.module';

@Module({
  imports: [PrismaModule, MailModule, RealtimeModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    {
      provide: NOTIFICATION_REPOSITORY,
      useClass: PrismaNotificationRepository,
    },
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
