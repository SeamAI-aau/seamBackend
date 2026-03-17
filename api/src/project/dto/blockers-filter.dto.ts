import {
  IsOptional,
  IsIn,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const BLOCKER_SOURCE_GITHUB = 'github';
export const BLOCKER_SOURCE_TRANSCRIPT = 'transcript';

export class BlockersFilterDto {
  @ApiPropertyOptional({
    description:
      'Filter by blocker source. When omitted, both GitHub and transcript blockers are returned.',
    enum: [BLOCKER_SOURCE_GITHUB, BLOCKER_SOURCE_TRANSCRIPT],
    example: BLOCKER_SOURCE_GITHUB,
  })
  @IsOptional()
  @IsIn([BLOCKER_SOURCE_GITHUB, BLOCKER_SOURCE_TRANSCRIPT])
  source?: 'github' | 'transcript';

  @ApiPropertyOptional({
    description: 'Page number (1-based). Defaults to 1.',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of blockers per page. Defaults to 50, max 200.',
    example: 50,
    minimum: 1,
    maximum: 200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Only include blockers created on or after this ISO date.',
    example: '2026-03-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  /** Filter transcript blockers by category (e.g. "risk", "dependency"). */
  @ApiPropertyOptional({
    description: 'Filter transcript blockers by category, such as "risk" or "dependency".',
    example: 'dependency',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;
}
