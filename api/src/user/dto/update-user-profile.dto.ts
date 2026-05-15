import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserProfileDto {
  @ApiPropertyOptional({
    example: 'Jane Doe',
    description: 'Display name.',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    example: 'jane-doe-dev',
    description:
      'GitHub login used to attribute commits and PRs in developer activity. Does not connect OAuth; use Integrations → GitHub for that.',
    maxLength: 39,
  })
  @IsOptional()
  @IsString()
  @MaxLength(39)
  githubUsername?: string;
}
