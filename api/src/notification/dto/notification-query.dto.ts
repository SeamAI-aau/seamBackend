import { IsOptional, IsDateString, IsUUID, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class NotificationQueryDto {
  @ApiPropertyOptional({ description: 'Only unread notifications.' })
  @IsOptional()
  @Type(() => Boolean)
  unreadOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by notification type (e.g. task_assigned, blocker_detected).',
  })
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filter where metadata.projectId matches (most notifications include this).',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filter where metadata.taskId matches.',
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  })
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @ApiPropertyOptional({ description: 'Created on or after (ISO 8601).' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Created on or before (ISO 8601).' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;
}
