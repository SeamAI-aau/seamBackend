import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class JiraTransitionIssueDto {
  @ApiProperty({
    description:
      'Transition id from GET .../transitions (workflow-specific; e.g. "21" or a UUID depending on your Jira site).',
    example: '21',
  })
  @IsString()
  @MinLength(1)
  transitionId!: string;
}
