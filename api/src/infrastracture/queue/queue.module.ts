import { Module, Injectable } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MeetingProducer } from './meeting.producer';
import { MEETING_TRANSCRIPTION_QUEUE_NAME } from '../../meeting/constants/meeting.constants';
import { Logger } from 'nestjs-pino';

@Injectable()
class DummyMeetingProducer {
  constructor(private readonly logger: Logger) {}

  async enqueue(meetingId: string, audioUrl: string) {
    this.logger.warn({ meetingId, audioUrl }, 'Queues are disabled; skipping enqueue');

  }
}

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

        BullModule.registerQueue({
          name: MEETING_TRANSCRIPTION_QUEUE_NAME,
          defaultJobOptions: {
            attempts: 5,
            backoff: {
              type: 'exponential',
              delay: 3000,
            },
            removeOnComplete: true,
            removeOnFail: false,
          },
        }),
      ],
  providers: disableQueues
    ? [
        {
          provide: MeetingProducer,
          useClass: DummyMeetingProducer,
        },
      ]
    : [MeetingProducer],
  exports: [MeetingProducer],
})
export class QueueModule {}
