import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateTaskDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Project ID to create the task under.',
  })
  @IsUUID()
  projectId!: string;

  @ApiProperty({
    example: 'Implement retry backoff for Stripe webhooks',
    description: 'Task title (used as Jira summary when synced).',
    minLength: 1,
    maxLength: 255,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional({
    example: 'Add exponential backoff with jitter. Ensure idempotency keys are used.',
    description: 'Optional task description (used as Jira description when synced).',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    description: 'If provided, task is assigned to this user and status set to SENT_TO_DEVELOPER.',
  })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}
