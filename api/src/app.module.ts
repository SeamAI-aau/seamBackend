import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import { Module } from '@nestjs/common/decorators/modules/module.decorator';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    HealthModule,
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                },
              }
            : undefined,
      },
    }),
  ],
})
export class AppModule {}
