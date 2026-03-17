import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateJiraIssueDto {
  @ApiPropertyOptional({
    example: 'Implement retry backoff for Stripe webhooks',
    description: 'Optional new Jira issue summary (and task title).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({
    example:
      'Please add exponential backoff with jitter for webhook retries. Ensure idempotency keys are used.',
    description: 'Optional new Jira issue description (and task description).',
  })
  @IsOptional()
  @IsString()
  description?: string;
}

