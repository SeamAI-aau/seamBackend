import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Allows a developer to edit a task draft before approving (and before Jira sync).
 */
export class UpdateTaskDraftDto {
  @ApiPropertyOptional({
    example: 'Implement retry backoff for Stripe webhooks',
    description: 'Optional task title update (will be used as Jira summary when approved).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({
    example:
      'Please add exponential backoff with jitter for webhook retries. Ensure idempotency keys are used.',
    description:
      'Optional task description update (will be used as Jira description when approved).',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
