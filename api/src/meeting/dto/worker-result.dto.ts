import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type { Prisma } from '@prisma/client';

/**
 * Payload for a single extracted task from the AI pipeline.
 */
export interface WorkerTaskPayload {
  title: string;
  description?: string;
  assigneeId?: string;
}

/**
 * Blocker extracted from transcript by NLP (e.g. risk, dependency, resource).
 * Persisted as TranscriptBlocker and shown next to GitHub blockers on dashboard.
 */
export interface WorkerBlockerPayload {
  /** Optional category for filtering/display (e.g. "risk", "dependency", "resource"). */
  category?: string;
  /** Human-readable blocker description from NLP. */
  message: string;
}

/**
 * Optional meeting metadata from the AI pipeline (audio analysis).
 */
export interface WorkerMeetingMetadata {
  durationSeconds?: number;
  participants?: Array<{ userId?: string; email?: string; name?: string }>;
}

/**
 * Payload sent by ai-engine-2 (or a bridge) to POST /internal/meetings/:id/result.
 * On success: transcript, diarization, tasks, optional blockers, optional meeting metadata.
 * On failure: status 'failed' and error message.
 */
export interface WorkerResultPayload {
  status: 'success' | 'failed';
  transcript?: string;
  /** Engine JSON object; `WorkerResultBodyDto` uses `Record<string, unknown>` for validation. */
  diarization?: typeof Prisma.JsonNull | Prisma.InputJsonValue | Record<string, unknown>;
  tasks?: WorkerTaskPayload[];
  /** Blockers extracted from transcript by NLP; persisted and exposed next to GitHub blockers. */
  blockers?: WorkerBlockerPayload[];
  /** Optional meeting metadata (duration, participants from diarization/audio). */
  meeting?: WorkerMeetingMetadata;
  error?: string;
}

/** Request body for `POST /internal/meetings/:id/result` (Swagger + validation). */
export class WorkerTaskBodyDto {
  @ApiProperty({ example: 'Ship OAuth refresh fix', description: 'Task title shown in the dashboard.' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ description: 'Optional longer description from NLP.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'When the engine resolves a project member UUID, the task is auto-assigned.',
  })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}

export class WorkerBlockerBodyDto {
  @ApiPropertyOptional({ example: 'dependency', description: 'Optional category (e.g. severity bucket from engine).' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ example: 'Blocked on API contract from partner team.' })
  @IsString()
  @IsNotEmpty()
  message!: string;
}

export class WorkerMeetingParticipantBodyDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;
}

export class WorkerMeetingBodyDto {
  @ApiPropertyOptional({ example: 3600, description: 'Recording duration in seconds.' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  durationSeconds?: number;

  @ApiPropertyOptional({ type: [WorkerMeetingParticipantBodyDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkerMeetingParticipantBodyDto)
  participants?: WorkerMeetingParticipantBodyDto[];
}

/**
 * JSON body for the ai-engine-2 → Nest callback. Matches the FastAPI `WebhookService` contract
 * (`send_meeting_success` / `send_meeting_failure`).
 */
export class WorkerResultBodyDto {
  @ApiProperty({ enum: ['success', 'failed'] })
  @IsIn(['success', 'failed'])
  status!: 'success' | 'failed';

  @ApiPropertyOptional({
    description: 'Full transcript text. Required for successful persistence when status is success.',
  })
  @ValidateIf((o: WorkerResultBodyDto) => o.status === 'success')
  @IsString()
  transcript?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Diarization JSON (object). Empty object if none.',
  })
  @IsOptional()
  @IsObject()
  diarization?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [WorkerTaskBodyDto], description: 'Extracted tasks; omit or use [] when none.' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkerTaskBodyDto)
  tasks?: WorkerTaskBodyDto[];

  @ApiPropertyOptional({ type: [WorkerBlockerBodyDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkerBlockerBodyDto)
  blockers?: WorkerBlockerBodyDto[];

  @ApiPropertyOptional({ type: WorkerMeetingBodyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkerMeetingBodyDto)
  meeting?: WorkerMeetingBodyDto;

  @ApiPropertyOptional({ description: 'Human-readable failure reason when status is failed.' })
  @ValidateIf((o: WorkerResultBodyDto) => o.status === 'failed')
  @IsOptional()
  @IsString()
  error?: string;
}
