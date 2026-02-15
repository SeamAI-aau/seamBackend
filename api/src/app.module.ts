import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RequestContextInterceptor } from './common/Interceptors/request-context.interceptor';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    HealthModule,
    AuthModule,
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
      provide: APP_INTERCEPTOR,
      useClass: RequestContextInterceptor,
    },
  ],
  controllers: [AppController],
})
export class AppModule {}
