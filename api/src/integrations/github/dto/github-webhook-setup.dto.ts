import { ApiProperty } from '@nestjs/swagger';

export class GithubWebhookSetupDto {
  @ApiProperty({
    example: 'https://seambackend.onrender.com/integrations/github/webhook',
    description:
      'Public URL to paste into GitHub → Repository → Settings → Webhooks → Payload URL.',
  })
  payloadUrl!: string;

  @ApiProperty({
    example: true,
    description:
      'True when `GITHUB_WEBHOOK_SECRET` is set on this API. The same value must be entered as the webhook Secret in GitHub.',
  })
  secretConfigured!: boolean;

  @ApiProperty({ example: 'application/json' })
  contentType!: string;

  @ApiProperty({
    example: ['pull_request'],
    description: 'GitHub webhook events Seam processes.',
  })
  events!: string[];

  @ApiProperty({
    example:
      'Add this webhook on the GitHub repository linked to your Seam workspace (not the organization root unless you only use one repo).',
  })
  instructions!: string;
}
