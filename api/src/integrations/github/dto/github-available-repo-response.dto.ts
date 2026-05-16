import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GitHubAvailableRepoDto {
  @ApiProperty({
    description: 'GitHub repository id.',
    example: 123456789,
  })
  id!: number;

  @ApiProperty({
    description: 'Repository full name (owner/repo).',
    example: 'acme/payments-api',
  })
  fullName!: string;

  @ApiProperty({
    description: 'Short repository name.',
    example: 'payments-api',
  })
  name!: string;

  @ApiProperty({
    description: 'Canonical GitHub URL. Pass to POST /integrations/github/link/:projectId as repoUrl.',
    example: 'https://github.com/acme/payments-api',
  })
  htmlUrl!: string;

  @ApiProperty({
    description: 'Whether the repository is private.',
    example: false,
  })
  private!: boolean;

  @ApiProperty({
    description: 'Owner login (user or org).',
    example: 'acme',
  })
  ownerLogin!: string;

  @ApiPropertyOptional({
    description: 'Repository description from GitHub, when set.',
    nullable: true,
  })
  description!: string | null;
}

export class GitHubAvailableReposResponseDto {
  @ApiProperty({ type: [GitHubAvailableRepoDto] })
  items!: GitHubAvailableRepoDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 50 })
  perPage!: number;

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({
    description: 'True when there are no more pages from GitHub.',
    example: true,
  })
  isLast!: boolean;
}
