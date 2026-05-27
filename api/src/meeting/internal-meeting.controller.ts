import {
  Controller,
  Post,
  Param,
  Body,
  Headers,
  HttpCode,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiTags,
  ApiOperation,
  ApiSecurity,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiInternalServerErrorResponse,
  ApiBody,
} from '@nestjs/swagger';
import { MeetingProcessingService } from './meeting-processing.service';
import { WorkerResultBodyDto } from './dto/worker-result.dto';
import { timingSafeSecretEqual } from '../common/utils/timing-safe-secret.util';

const WORKER_SECRET_HEADER = 'x-worker-secret';

const AI_ENGINE_PROCESS_AUDIO_DOC = [
  '**ai-engine-2 (FastAPI) — inbound audio**',
  '',
  'After this API uploads audio to object storage, it dispatches processing by calling the engine:',
  '',
  '- **Method / path:** `POST {AI_ENGINE_BASE_URL}/api/v1/meetings/process-audio`',
  '- **Content-Type:** `multipart/form-data`',
  '- **Form fields:** `meeting_id` (string), `project_id` (string), `file` (binary audio)',
  '- **Response (202):** JSON `{ status, meeting_id, project_id, job_id }` — the engine accepts the file and runs the pipeline **in the background**; full results are delivered to this Nest route via webhook.',
  '',
  'Configure the engine with `NESTJS_BASE_URL` and `WORKER_SECRET` (same value as this API\'s `WORKER_SECRET`).',
].join('\n');

/**
 * Internal API for transcription results from ai-engine-2 (or a small bridge service).
 * Not protected by JWT; uses shared secret header `x-worker-secret` (see `WORKER_SECRET`).
 */
@ApiTags('Internal — AI engine callbacks')
@ApiSecurity('worker-secret')
@Controller('internal/meetings')
export class InternalMeetingController {
  private readonly logger = new Logger(InternalMeetingController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly meetingProcessingService: MeetingProcessingService,
  ) {}

  @Post(':id/result')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Receive meeting pipeline result (ai-engine-2 callback)',
    description: [
      'Callback used by **ai-engine-2** when meeting audio processing finishes.',
      '',
      'Send header **`x-worker-secret`** with the same value as Nest env **`WORKER_SECRET`**.',
      '',
      '**Success body:** `status: "success"` with `transcript`, `new_tasks` (full payload), `transitioned_tasks` (reconciled status suggestions), `blockers`, `summary`, `insights`, and `suggested_actions`. Meeting becomes **`TASKS_EXTRACTED`**; developers with resolved assignee IDs get `task_assigned`; unassigned tasks notify owner + Scrum Masters (`tasks_pending_assignment`).',
      '',
      '**Failure body:** `status: "failed"` with `error` (string). Meeting becomes **`FAILED`**.',
      '',
      '---',
      '',
      AI_ENGINE_PROCESS_AUDIO_DOC,
    ].join('\n'),
  })
  @ApiOkResponse({
    description: 'Callback accepted; transcript/tasks persisted or duplicate meeting skipped.',
    schema: { example: { message: 'Received' } },
  })
  @ApiUnauthorizedResponse({ description: 'Missing/invalid `x-worker-secret` or worker not configured.' })
  @ApiInternalServerErrorResponse({
    description: 'Persistence failed (e.g. meeting not found, invalid payload after validation).',
  })
  @ApiBody({ type: WorkerResultBodyDto })
  async receiveResult(
    @Param('id') meetingId: string,
    @Body() payload: WorkerResultBodyDto,
    @Headers(WORKER_SECRET_HEADER) secret: string | undefined,
  ): Promise<{ message: string }> {
    const expected = this.config.get<string>('WORKER_SECRET');

    if (!expected) {
      throw new UnauthorizedException('Worker callback not configured');
    }

    if (!timingSafeSecretEqual(secret, expected)) {
      throw new UnauthorizedException('Invalid worker secret');
    }

    this.logger.log(
      {
        meetingId,
        status: payload.status,
        transcriptLength: (payload.transcript || '').length,
        tasksCount: payload.tasks?.length ?? 0,
        newTasksCount: payload.new_tasks?.length ?? 0,
        transitionedTasksCount: payload.transitioned_tasks?.length ?? 0,
        blockersCount: payload.blockers?.length ?? 0,
        hasSummary: Boolean(payload.summary),
      },
      'Received worker callback payload',
    );

    this.logger.log(
      {
        meetingId,
        tasksPayload: JSON.stringify(payload.tasks ?? []),
        newTasksPayload: JSON.stringify(payload.new_tasks ?? []),
        transitionedTasksPayload: JSON.stringify(payload.transitioned_tasks ?? []),
      },
      'Worker callback task payloads (raw)'
    );

    await this.meetingProcessingService.handleWorkerResult(meetingId, payload);
    const result = { message: 'Received' };
    this.logger.log({ meetingId, result }, 'Worker callback processed');
    return result;
  }
}
