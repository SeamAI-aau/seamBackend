import { IsOptional, IsUUID, IsEnum, IsDateString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { TaskStatus } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DashboardFilterDto {
  @ApiPropertyOptional({
    description: 'Filter tasks and KPIs by assignee (user id).',
    example: 'user-123',
  })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({
    description: 'Filter tasks and KPIs by task status.',
    enum: TaskStatus,
    example: TaskStatus.SENT_TO_DEVELOPER,
  })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({
    description: 'Filter items created on or after this ISO date (inclusive).',
    example: '2026-03-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Filter items created on or before this ISO date (inclusive).',
    example: '2026-03-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({
    description: 'Number of recent tasks per page.',
    example: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  recentTasksLimit?: number;

  @ApiPropertyOptional({
    description: 'Number of recent meetings per page.',
    example: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  recentMeetingsLimit?: number;

  @ApiPropertyOptional({
    description: 'Maximum blockers to include per source.',
    example: 50,
    minimum: 1,
    maximum: 200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  blockersLimit?: number;

  @ApiPropertyOptional({
    description: 'Page number for recent tasks (1-based). Defaults to 1.',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  recentTasksPage?: number = 1;

  @ApiPropertyOptional({
    description: 'Page number for recent meetings (1-based). Defaults to 1.',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  recentMeetingsPage?: number = 1;

  @ApiPropertyOptional({
    description: 'Page number for blockers lists (1-based). Defaults to 1.',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  blockersPage?: number = 1;
}
