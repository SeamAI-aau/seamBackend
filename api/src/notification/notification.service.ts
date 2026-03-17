import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { INotificationRepository } from './notification.repository';
import { NOTIFICATION_REPOSITORY } from './notification.tokens';
import { MailService } from '../infrastracture/mail/mail.service';
import { EMAIL_ENABLED_TYPES } from './constants/notification-types';
import { ConfigService } from '@nestjs/config';
import { RealtimeService } from '../infrastracture/realtime/realtime.service';


export interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
  /** Override: send email even if type is not in EMAIL_ENABLED_TYPES */
  sendEmail?: boolean;
}

/** For recipients who are not yet users (e.g. invitation email to pending invitee) */
export interface NotifyEmailOnlyInput {
  to: string;
  type: string;
  title: string;
  body?: string;
}

@Injectable()
export class NotificationService {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repo: INotificationRepository,
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Create in-app notification (browser & VS Code) and optionally send email.
   */
  async notify(input: NotifyInput): Promise<{ id: string; emailSent: boolean }> {
    const notification = await this.repo.create({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      metadata: input.metadata ?? undefined,
    });

    this.realtime.emitToUser(input.userId, 'notification.created', notification);
    this.repo
      .count({ userId: input.userId, unreadOnly: true })
      .then((count) => this.realtime.emitToUser(input.userId, 'notification.unreadCount', { count }))
      .catch(() => undefined);

    const shouldSendEmail =
      input.sendEmail ?? EMAIL_ENABLED_TYPES.includes(input.type as (typeof EMAIL_ENABLED_TYPES)[number]);
    let emailSent = false;

    if (shouldSendEmail) {
      const user = await this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { email: true, name: true },
      });
      if (user?.email) {
        const { subject, text } = this.buildEmailContent(input, user.name);
        emailSent = await this.mail.send({
          to: user.email,
          subject,
          text,
        });
      }
    }

    return { id: notification.id, emailSent };
  }

  /**
   * Send email only (no in-app notification). Use for recipients without a user account (e.g. invitation_sent).
   */
  async notifyEmailOnly(input: NotifyEmailOnlyInput): Promise<boolean> {
    const { subject, text } = this.buildEmailContent(
      { ...input, userId: '' },
      null,
    );
    return this.mail.send({
      to: input.to,
      subject,
      text,
    });
  }

  async getForUser(
    userId: string,
    filters: { unreadOnly?: boolean; type?: string; fromDate?: string; toDate?: string; page?: number; limit?: number },
  ) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 100);
    const skip = (page - 1) * limit;

    const filterInput = {
      userId,
      unreadOnly: filters.unreadOnly,
      type: filters.type,
      fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
      toDate: filters.toDate ? new Date(filters.toDate) : undefined,
    };

    const [items, total] = await Promise.all([
      this.repo.findMany(filterInput, { skip, take: limit }),
      this.repo.count(filterInput),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async markAsRead(id: string, userId: string): Promise<boolean> {
    return this.repo.markAsRead(id, userId);
  }

  async markAllAsRead(userId: string): Promise<{ count: number }> {
    const count = await this.repo.markAllAsRead(userId);
    return { count };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.repo.count({ userId, unreadOnly: true });
  }

  private buildEmailContent(
    input: NotifyInput,
    userName: string | null,
  ): { subject: string; text: string } {
    const appName = this.config.get<string>('APP_NAME') ?? 'Seam';
    const greeting = userName ? `Hi ${userName},` : 'Hi,';

    switch (input.type) {
      case 'invitation_sent':
        return {
          subject: `${appName}: Project invitation`,
          text: `${greeting}\n\n${input.title}\n\n${input.body ?? ''}\n\n— ${appName}`,
        };
      case 'task_assigned':
        return {
          subject: `${appName}: New task assigned`,
          text: `${greeting}\n\n${input.title}\n\n${input.body ?? ''}\n\n— ${appName}`,
        };
      case 'blocker_detected':
        return {
          subject: `${appName}: Blocker detected`,
          text: `${greeting}\n\n${input.title}\n\n${input.body ?? ''}\n\n— ${appName}`,
        };
      default:
        return {
          subject: `${appName}: ${input.title}`,
          text: `${greeting}\n\n${input.body ?? input.title}\n\n— ${appName}`,
        };
    }
  }
}
