import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { ProjectModule } from './project/project.module';
import { MeetingModule } from './meeting/meeting.module';
import { TaskModule } from './tasks/task.module';
import { JiraModule } from './integrations/jira/jira.module';
import { GithubModule } from './integrations/github/github.module';
import { ActivityLogModule } from './activity-log/activity-log.module';
import { DeveloperActivityModule } from './developer-activity/developer-activity.module';
import { MailModule } from './infrastracture/mail/mail.module';
import { NotificationModule } from './notification/notification.module';
import { APP_FILTER } from '@nestjs/core';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    UserModule,
    ProjectModule,
    MeetingModule,
    TaskModule,
    JiraModule,
    GithubModule,
    ActivityLogModule,
    DeveloperActivityModule,
    MailModule,
    NotificationModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',

        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: { singleLine: true },
              }
            : undefined,

        genReqId: (req) => {
          return req.headers['x-request-id'] || crypto.randomUUID();
        },

        customProps: (req) => ({
          requestId: req.id,
        }),
      },
    }),
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
  controllers: [AppController],
})
export class AppModule {}
