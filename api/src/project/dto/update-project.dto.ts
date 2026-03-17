import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProjectDto {
  @ApiPropertyOptional({
    example: 'Payments Squad — Q2 Standups',
    description: 'Project name.',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    example: 'Tracks standup action items for the Payments squad.',
    description: 'Project description.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: 'https://github.com/acme/repo',
    description: 'GitHub repository URL for the project.',
  })
  @IsOptional()
  @IsString()
  githubRepoUrl?: string;

  @ApiPropertyOptional({
    example: 'PROJ',
    description: 'Jira project key (e.g. PROJ, MYTEAM). Used when syncing approved tasks to Jira. Can also be set via POST /integrations/jira/link/:projectId.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  jiraProjectKey?: string;
}
