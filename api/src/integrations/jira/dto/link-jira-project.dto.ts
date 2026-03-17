import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LinkJiraProjectDto {
  @ApiProperty({
    example: 'PROJ',
    description: 'Jira project key (e.g. PROJ, MYTEAM). The project must exist in the connected Jira site.',
  })
  @IsString()
  @MinLength(1, { message: 'projectKey is required' })
  projectKey!: string;
}
