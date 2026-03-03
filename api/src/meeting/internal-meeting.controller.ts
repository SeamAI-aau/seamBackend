import {
  Controller,
  Post,
  Param,
  Body,
  Headers,
  HttpCode,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';

interface WorkerResultPayload {
  status: string;
  transcript?: string;
  tasks?: unknown[];
  error?: string;
}

@Controller('internal/meetings')
export class InternalMeetingsController {
  constructor(private readonly config: ConfigService, private readonly logger: Logger) {}

  @Post(':id/result')
  @HttpCode(200)
  async receiveResult(
    @Param('id') meetingId: string,
    @Body() payload: WorkerResultPayload,
    @Headers('x-worker-secret') secret: string | undefined,
  ) {
    const expected = this.config.get<string>('WORKER_SECRET');

    if (!expected) {
      this.logger.error('WORKER_SECRET is not configured');
      throw new UnauthorizedException();
    }

    if (!secret || secret !== expected) {
      this.logger.warn({ meetingId }, 'Invalid worker secret');
      throw new UnauthorizedException();
    }

    this.logger.log(
      {
        meetingId,
        status: payload.status,
      },
      'Worker result received (stub only)',
    );

    // DO NOT persist yet (EPIC 9)

    return { message: 'Received' };
  }
}
