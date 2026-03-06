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
import { MeetingProcessingService } from './meeting-processing.service';
import type { WorkerResultPayload } from './dto/worker-result.dto';

const WORKER_SECRET_HEADER = 'x-worker-secret';

/**
 * Internal API for the Python (or other) transcription worker.
 * Not protected by JWT; uses shared secret in header.
 */
@Controller('internal/meetings')
export class InternalMeetingController {
  constructor(
    private readonly config: ConfigService,
    private readonly meetingProcessingService: MeetingProcessingService,
  ) {}

  @Post(':id/result')
  @HttpCode(200)
  async receiveResult(
    @Param('id') meetingId: string,
    @Body() payload: WorkerResultPayload,
    @Headers(WORKER_SECRET_HEADER) secret: string | undefined,
  ): Promise<{ message: string }> {
    const expected = this.config.get<string>('WORKER_SECRET');

    if (!expected) {
      throw new UnauthorizedException('Worker callback not configured');
    }

    if (!secret || secret !== expected) {
      throw new UnauthorizedException('Invalid worker secret');
    }

    await this.meetingProcessingService.handleWorkerResult(meetingId, payload);
    return { message: 'Received' };
  }
}
