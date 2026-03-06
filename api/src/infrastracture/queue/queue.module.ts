import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MeetingProducer } from './meeting.producer';
import { MEETING_TRANSCRIPTION_QUEUE_NAME } from '../../meeting/constants/meeting.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),

    BullModule.registerQueue({
      name: MEETING_TRANSCRIPTION_QUEUE_NAME,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
        removeOnComplete: true,
        removeOnFail: false, // keep failed jobs (dead-letter ready)
      },
    }),
  ],
  providers: [MeetingProducer],
  exports: [MeetingProducer],
})
export class QueueModule {}
