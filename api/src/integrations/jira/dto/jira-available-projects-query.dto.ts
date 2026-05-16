import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class JiraAvailableProjectsQueryDto {
  @ApiPropertyOptional({
    description:
      'Optional filter passed to Jira project search (matches project name or key).',
    example: 'payments',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  query?: string;

  @ApiPropertyOptional({
    description: 'Page size (1–100). Defaults to 50.',
    example: 50,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  maxResults?: number;

  @ApiPropertyOptional({
    description: 'Pagination offset for Jira project search. Defaults to 0.',
    example: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  startAt?: number;
}
