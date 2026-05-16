import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class GitHubAvailableReposQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by repository name or owner/repo (case-insensitive substring).',
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
  perPage?: number;

  @ApiPropertyOptional({
    description: 'Page number (1-based). Defaults to 1.',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
