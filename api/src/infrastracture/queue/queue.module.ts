import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * Registers shared BullMQ Redis connection for Nest-owned queues (e.g. Jira/GitHub sync).
 * Meeting transcription is handled by ai-engine-2 over HTTP, not Bull.
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
            },
          }),
        }),
      ],
  providers: [],
  exports: [],
})
export class QueueModule {}
