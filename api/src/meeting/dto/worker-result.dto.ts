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

/**
 * Payload for a single extracted task from the AI pipeline.
 */
export interface WorkerNewTaskPayload {
  title?: string;
  description?: string;
  assignee?: string;
  assigneeId?: string;
  priority?: string;
  confidence?: number;
  transcript_reference?: string;
  deadline?: string;
  task_id?: string;
  jiraIssueKey?: string;
  jiraAction?: string;
  current_status?: string;
  suggested_status?: string;
  jiraProposalTransitionId?: string;
  jiraProposalTargetStatus?: string;
}

export interface WorkerTaskPayload extends WorkerNewTaskPayload {
  jiraIssueKey?: string;
  jiraAction?: string;
  current_status?: string;
  suggested_status?: string;
  jiraProposalTransitionId?: string;
  jiraProposalTargetStatus?: string;
}

/**
 * Payload for a transitioned (reconciled) Jira task.
 */
export interface WorkerTransitionedTaskPayload {
  title: string;
  description: string;
  assignee: string;
  confidence: number;
  transcript_reference: string;
  deadline?: string;
  task_id?: string;
  priority: string;
  current_status?: string;
  suggested_status?: string;
}

/**
 * Blocker extracted from transcript by NLP (e.g. risk, dependency, resource).
 * Persisted as TranscriptBlocker and shown next to GitHub blockers on dashboard.
 */
export interface WorkerBlockerPayload {
  description: string;
  affected_person?: string;
  severity?: string;
  confidence?: number;
  transcript_reference?: string;
  suggested_action?: string;
  affected_task_id?: string;
  blocker_id?: string;
}

/**
 * Optional meeting metadata from the AI pipeline (audio analysis).
 */
export interface WorkerSummaryPayload {
  summary: string;
  key_decisions?: string[];
  meeting_sentiment?: string;
  main_topic?: string;
}

/**
 * Payload sent by ai-engine-2 (or a bridge) to POST /internal/meetings/:id/result.
 * On success: transcript, diarization, tasks, optional blockers, optional meeting metadata.
 * On failure: status 'failed' and error message.
 */
export interface WorkerResultPayload {
  status: 'success' | 'failed';
  transcript?: string;
  tasks?: WorkerTaskPayload[];
  new_tasks?: WorkerTaskPayload[];
  transitioned_tasks?: WorkerTransitionedTaskPayload[];
  /** Blockers extracted from transcript by NLP; persisted and exposed next to GitHub blockers. */
  blockers?: WorkerBlockerPayload[];
  summary?: WorkerSummaryPayload;
  insights?: string[];
  suggested_actions?: string[];
  error?: string;
}

/** Request body for `POST /internal/meetings/:id/result` (Swagger + validation). */
export class WorkerNewTaskBodyDto {
  @ApiPropertyOptional({ example: 'Ship OAuth refresh fix', description: 'Task title shown in the dashboard.' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Optional longer description from NLP.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Assignee name from transcript, when available.' })
  @IsOptional()
  @IsString()
  assignee?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'When the engine resolves a project member UUID, the task is auto-assigned.',
  })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ example: 'High', description: 'Priority from NLP, if provided.' })
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional({ example: 0.82, description: 'Confidence score from NLP.' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  confidence?: number;

  @ApiPropertyOptional({ description: 'Exact quote from transcript.' })
  @IsOptional()
  @IsString()
  transcript_reference?: string;

  @ApiPropertyOptional({ description: 'Natural language or ISO date deadline, if provided.' })
  @IsOptional()
  @IsString()
  deadline?: string;

  @ApiPropertyOptional({ description: 'Optional external task id (e.g., Jira key).'})
  @IsOptional()
  @IsString()
  task_id?: string;

  @ApiPropertyOptional({ description: 'Optional Jira issue key from the AI engine.' })
  @IsOptional()
  @IsString()
  jiraIssueKey?: string;

  @ApiPropertyOptional({ description: 'Optional Jira action hint (create or transition).' })
  @IsOptional()
  @IsString()
  jiraAction?: string;

  @ApiPropertyOptional({ description: 'Current Jira status, if provided.' })
  @IsOptional()
  @IsString()
  current_status?: string;

  @ApiPropertyOptional({ description: 'Suggested Jira status, if provided.' })
  @IsOptional()
  @IsString()
  suggested_status?: string;

  @ApiPropertyOptional({ description: 'Proposed Jira transition id.' })
  @IsOptional()
  @IsString()
  jiraProposalTransitionId?: string;

  @ApiPropertyOptional({ description: 'Proposed Jira target status.' })
  @IsOptional()
  @IsString()
  jiraProposalTargetStatus?: string;
}

export class WorkerTransitionedTaskBodyDto {
  @ApiProperty({ example: 'SEAM-10 onboarding updates' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ description: 'Task description or action details.' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ description: 'Assignee label from transcript.' })
  @IsString()
  @IsNotEmpty()
  assignee!: string;

  @ApiProperty({ example: 0.9 })
  @IsNumber()
  @Type(() => Number)
  confidence!: number;

  @ApiProperty({ description: 'Exact quote from transcript.' })
  @IsString()
  @IsNotEmpty()
  transcript_reference!: string;

  @ApiPropertyOptional({ description: 'Natural language or ISO date deadline, if provided.' })
  @IsOptional()
  @IsString()
  deadline?: string;

  @ApiPropertyOptional({ description: 'External task id (e.g., Jira key).' })
  @IsOptional()
  @IsString()
  task_id?: string;

  @ApiProperty({ example: 'High' })
  @IsString()
  @IsNotEmpty()
  priority!: string;

  @ApiPropertyOptional({ description: 'Current Jira status, if provided.' })
  @IsOptional()
  @IsString()
  current_status?: string;

  @ApiPropertyOptional({ description: 'Suggested Jira status, if provided.' })
  @IsOptional()
  @IsString()
  suggested_status?: string;
}

export class WorkerBlockerBodyDto {
  @ApiProperty({ example: 'Blocked on API contract from partner team.' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiPropertyOptional({ description: 'Person affected by the blocker.' })
  @IsOptional()
  @IsString()
  affected_person?: string;

  @ApiPropertyOptional({ example: 'High' })
  @IsOptional()
  @IsString()
  severity?: string;

  @ApiPropertyOptional({ example: 0.72 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  confidence?: number;

  @ApiPropertyOptional({ description: 'Exact quote from transcript.' })
  @IsOptional()
  @IsString()
  transcript_reference?: string;

  @ApiPropertyOptional({ description: 'Suggested remediation, if provided.' })
  @IsOptional()
  @IsString()
  suggested_action?: string;

  @ApiPropertyOptional({ description: 'Related task id, if provided.' })
  @IsOptional()
  @IsString()
  affected_task_id?: string;

  @ApiPropertyOptional({ description: 'Optional blocker id.' })
  @IsOptional()
  @IsString()
  blocker_id?: string;
}

export class WorkerSummaryBodyDto {
  @ApiProperty({ description: 'Overall meeting narrative.' })
  @IsString()
  @IsNotEmpty()
  summary!: string;

  @ApiPropertyOptional({ type: [String], description: 'Key decisions captured from the meeting.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  key_decisions?: string[];

  @ApiPropertyOptional({ description: 'Dominant emotional tone.' })
  @IsOptional()
  @IsString()
  meeting_sentiment?: string;

  @ApiPropertyOptional({ description: 'Primary focus of the session.' })
  @IsOptional()
  @IsString()
  main_topic?: string;
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
    type: [WorkerNewTaskBodyDto],
    description: 'Newly extracted tasks (full payload). Omit or use [] when none.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkerNewTaskBodyDto)
  new_tasks?: WorkerNewTaskBodyDto[];

  @ApiPropertyOptional({
    type: [WorkerNewTaskBodyDto],
    description: 'Merged tasks list (new + transitioned). Preferred over new_tasks/transitioned_tasks.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkerNewTaskBodyDto)
  tasks?: WorkerNewTaskBodyDto[];

  @ApiPropertyOptional({
    type: [WorkerTransitionedTaskBodyDto],
    description: 'Transitioned (reconciled) tasks with status suggestions.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkerTransitionedTaskBodyDto)
  transitioned_tasks?: WorkerTransitionedTaskBodyDto[];

  @ApiPropertyOptional({ type: [WorkerBlockerBodyDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkerBlockerBodyDto)
  blockers?: WorkerBlockerBodyDto[];

  @ApiPropertyOptional({ type: WorkerSummaryBodyDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => WorkerSummaryBodyDto)
  summary?: WorkerSummaryBodyDto;

  @ApiPropertyOptional({
    type: [String],
    description: 'High-level insights derived from the meeting transcript.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  insights?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Suggested next actions for the team based on the transcript.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suggested_actions?: string[];

  @ApiPropertyOptional({ description: 'Human-readable failure reason when status is failed.' })
  @ValidateIf((o: WorkerResultBodyDto) => o.status === 'failed')
  @IsOptional()
  @IsString()
  error?: string;
}
