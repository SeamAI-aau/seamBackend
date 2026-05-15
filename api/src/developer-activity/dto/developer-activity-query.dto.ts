import { IsOptional, IsIn, IsDateString, IsUUID, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DeveloperActivityQueryDto {
  @ApiPropertyOptional({
    enum: ['GITHUB', 'JIRA'],
    description: 'Filter activities by integration source.',
    example: 'GITHUB',
  })
  @IsOptional()
  @IsIn(['GITHUB', 'JIRA'])
  source?: 'GITHUB' | 'JIRA';

  @ApiPropertyOptional({
    description: 'Filter activities to a specific project member (user UUID).',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Include activities on or after this ISO 8601 date (inclusive).',
    example: '2026-04-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Include activities on or before this ISO 8601 date (inclusive).',
    example: '2026-04-30T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({
    description: 'Page number (1-based). Defaults to 1.',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Items per page. Defaults to 50, max 100.',
    example: 50,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;
}

export class DeveloperActivityChartQueryDto {
  @ApiPropertyOptional({
    description:
      'Start of chart range (ISO 8601). Defaults to 30 days before toDate when omitted.',
    example: '2026-04-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'End of chart range (ISO 8601). Defaults to now when omitted.',
    example: '2026-04-30T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({
    enum: ['day', 'week'],
    description:
      'Bucket size for aggregating activity counts. Week buckets start on Sunday (UTC).',
    example: 'day',
    default: 'day',
  })
  @IsOptional()
  @IsIn(['day', 'week'])
  groupBy?: 'day' | 'week';

  @ApiPropertyOptional({
    description: 'Limit chart data to a single project member (user UUID).',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
