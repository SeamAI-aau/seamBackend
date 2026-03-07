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

export const BLOCKER_SOURCE_GITHUB = 'github';
export const BLOCKER_SOURCE_TRANSCRIPT = 'transcript';

export class BlockersFilterDto {
  @IsOptional()
  @IsIn([BLOCKER_SOURCE_GITHUB, BLOCKER_SOURCE_TRANSCRIPT])
  source?: 'github' | 'transcript';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  /** Filter transcript blockers by category (e.g. "risk", "dependency"). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;
}
