import { IsString, MinLength } from 'class-validator';

export class LinkJiraProjectDto {
  @IsString()
  @MinLength(1, { message: 'projectKey is required' })
  projectKey!: string;
}
