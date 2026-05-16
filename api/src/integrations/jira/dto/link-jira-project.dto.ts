import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LinkJiraProjectDto {
  @ApiProperty({
    example: 'PROJ',
    description:
      'Jira project key (e.g. PROJ, MYTEAM). Obtain from GET /integrations/jira/available-projects after OAuth, or from your Jira board URL.',
  })
  @IsString()
  @MinLength(1, { message: 'projectKey is required' })
  projectKey!: string;
}
