import { IsString, IsUrl, Matches } from 'class-validator';

export class LinkRepoDto {
  @IsString()
  @IsUrl()
  @Matches(/^https?:\/\/github\.com\/[^/]+\/[^/]+\/?$/i, {
    message: 'Must be a valid GitHub repository URL (e.g. https://github.com/owner/repo)',
  })
  repoUrl!: string;
}
