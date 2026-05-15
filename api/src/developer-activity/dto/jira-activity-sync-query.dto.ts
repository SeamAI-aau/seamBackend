import { IsOptional, IsDateString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class JiraActivitySyncQueryDto {
  @ApiPropertyOptional({
    description:
      'Sync issues updated on or after this date (ISO 8601). Defaults to project last sync or 30 days ago.',
    example: '2026-04-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Sync issues updated on or before this date (ISO 8601). Defaults to now.',
    example: '2026-04-30T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of Jira issues to scan (pagination stops early). Default 100, max 500.',
    example: 100,
    minimum: 1,
    maximum: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  maxIssues?: number;
}
