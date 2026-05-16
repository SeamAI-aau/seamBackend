import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class JiraAvailableProjectDto {
  @ApiProperty({
    description: 'Jira internal project id (numeric string).',
    example: '10042',
  })
  id!: string;

  @ApiProperty({
    description: 'Jira project key used in issue keys (e.g. PAY-1). Stored on Seam as jiraProjectKey.',
    example: 'PAY',
  })
  key!: string;

  @ApiProperty({
    description: 'Human-readable Jira project name.',
    example: 'Payments Squad',
  })
  name!: string;

  @ApiPropertyOptional({
    description: 'Jira project type (e.g. software, business).',
    example: 'software',
    nullable: true,
  })
  projectTypeKey!: string | null;

  @ApiPropertyOptional({
    description: 'Small avatar URL from Jira, when available.',
    nullable: true,
  })
  avatarUrl!: string | null;
}

export class JiraAvailableProjectsResponseDto {
  @ApiProperty({ type: [JiraAvailableProjectDto] })
  items!: JiraAvailableProjectDto[];

  @ApiProperty({ example: 0 })
  startAt!: number;

  @ApiProperty({ example: 50 })
  maxResults!: number;

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({
    description: 'True when there are no more pages.',
    example: true,
  })
  isLast!: boolean;
}
