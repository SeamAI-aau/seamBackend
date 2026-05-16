import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiResponse,
} from '@nestjs/swagger';
import { GithubWebhookService } from './github-webhook.service';

/**
 * Push-driven GitHub integration. No JWT — authenticated via `X-Hub-Signature-256`
 * using env `GITHUB_WEBHOOK_SECRET` (must match the secret configured on GitHub).
 */
@ApiTags('Integrations - GitHub')
@Controller('integrations/github')
export class GithubWebhookController {
  constructor(private readonly githubWebhookService: GithubWebhookService) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({
    summary: 'GitHub repository webhook',
    description: [
      'Receives GitHub webhook events (e.g. `pull_request`). Verifies `X-Hub-Signature-256` with `GITHUB_WEBHOOK_SECRET`,',
      'deduplicates using `X-GitHub-Delivery`, then enqueues PR sync for each Seam project whose linked repo matches `repository.full_name`.',
      '',
      '**Security:** unauthenticated route; relies on HMAC. Configure the same secret in GitHub → Webhook → Secret.',
    ].join(' '),
  })
  @ApiOkResponse({
    description: 'Accepted (GitHub expects 2xx quickly). Body is informational.',
    schema: {
      example: { ok: true, queued: true, projectIds: 1 },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Bad or missing HMAC signature / delivery id / JSON.' })
  @ApiResponse({
    status: 503,
    description: '`GITHUB_WEBHOOK_SECRET` is not set on this API.',
  })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature256: string | undefined,
    @Headers('x-github-delivery') deliveryId: string | undefined,
    @Headers('x-github-event') event: string | undefined,
  ) {
    this.githubWebhookService.assertRawBody(req.rawBody);
    return this.githubWebhookService.handleWebhook({
      rawBody: req.rawBody,
      signature256,
      deliveryId,
      event,
    });
  }
}
