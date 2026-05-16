import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl, Matches } from 'class-validator';

export class LinkRepoDto {
  @ApiProperty({
    example: 'https://github.com/acme/payments-api',
    description:
      'Full GitHub repository URL. Obtain from GET /integrations/github/available-repositories after OAuth, or use https://github.com/owner/repo.',
  })
  @IsString()
  @IsUrl()
  @Matches(/^https?:\/\/github\.com\/[^/]+\/[^/]+\/?$/i, {
    message: 'Must be a valid GitHub repository URL (e.g. https://github.com/owner/repo)',
  })
  repoUrl!: string;
}
