import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * Registers shared BullMQ Redis connection for Nest-owned queues (GitHub/Jira sync).
 * Meeting transcription uses ai-engine-2 HTTP callbacks — not Bull (`DISABLE_QUEUES` does not affect meetings).
 */
const disableQueues = process.env.DISABLE_QUEUES === 'true';

@Module({
  imports: disableQueues
    ? []
    : [
        BullModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            connection: {
              host: config.get<string>('REDIS_HOST', 'localhost'),
              port: config.get<number>('REDIS_PORT', 6379),
              ...(config.get<string>('REDIS_PASSWORD')
                ? { password: config.get<string>('REDIS_PASSWORD') }
                : {}),
              ...(config.get<string>('REDIS_TLS') === 'true'
                ? { tls: {} }
                : {}),
            },
          }),
        }),
      ],
  providers: [],
  exports: [],
})
export class QueueModule {}
