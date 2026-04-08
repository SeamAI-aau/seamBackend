import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/** Allowed outcome statuses for the assignee to set on a task. */
export const TASK_OUTCOME_STATUS = ['APPROVED', 'REJECTED'] as const;
export type TaskOutcomeStatus = (typeof TASK_OUTCOME_STATUS)[number];

/**
 * Combined body for editing draft and/or approving/declining a task.
 * - Only title/description: update draft (task must be SENT_TO_DEVELOPER and not synced to Jira).
 * - status APPROVED: approve task. Optional title/description in this request are applied first (final draft), then status is set to APPROVED and Jira sync runs. The task must have a title (existing or in this request). No updates to the task body after it is approved/synced.
 * - status REJECTED: decline task.
 * Only the assigned developer can call. All fields are optional; at least one must be provided.
 */
export class UpdateTaskOutcomeDto {
  @ApiPropertyOptional({
    enum: TASK_OUTCOME_STATUS,
    description:
      'Set outcome: APPROVED (approve task, may include final title/description) or REJECTED (decline).',
  })
  @IsOptional()
  @IsEnum(TASK_OUTCOME_STATUS)
  status?: TaskOutcomeStatus;

  @ApiPropertyOptional({
    example: 'Implement retry backoff for Stripe webhooks',
    description: 'Task title. When approving, this is the final value sent to Jira.',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({
    example: 'Add exponential backoff with jitter.',
    description: 'Task description. When approving, this is the final value sent to Jira.',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
