import { IsOptional, IsIn, IsDateString, IsUUID, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class DeveloperActivityQueryDto {
  @IsOptional()
  @IsIn(['GITHUB', 'JIRA'])
  source?: 'GITHUB' | 'JIRA';

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;
}

export class DeveloperActivityChartQueryDto {
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsIn(['day', 'week'])
  groupBy?: 'day' | 'week';

  @IsOptional()
  @IsUUID()
  userId?: string;
}
