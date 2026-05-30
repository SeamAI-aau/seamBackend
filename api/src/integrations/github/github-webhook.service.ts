import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { IProjectRepository } from '../../project/types/project.repository';
import { PROJECT_REPOSITORY } from '../../project/types/project.tokens';
import { GithubSyncQueue } from './queue/github-sync.queue';

const PR_SYNC_ACTIONS = new Set([
  'opened',
  'synchronize',
  'closed',
  'reopened',
  'edited',
  'ready_for_review',
]);

function verifyGithubSignature(
  secret: string,
  rawBody: Buffer,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) {
    return false;
  }
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  const digest = `sha256=${hmac.digest('hex')}`;
  const a = Buffer.from(digest, 'utf8');
  const b = Buffer.from(signatureHeader, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export type GithubWebhookHandleResult = {
  ok: true;
  duplicate?: boolean;
  ignored?: boolean;
  queued?: boolean;
  projectIds?: number;
  queuesDisabled?: boolean;
};

@Injectable()
export class GithubWebhookService {
  private readonly logger = new Logger(GithubWebhookService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly githubSyncQueue: GithubSyncQueue,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: IProjectRepository,
  ) {}

  private getSecretOrThrow(): string {
    const secret = this.config.get<string>('GITHUB_WEBHOOK_SECRET')?.trim();
    if (!secret) {
      throw new ServiceUnavailableException(
        'GitHub webhooks are not configured: set GITHUB_WEBHOOK_SECRET to match the secret in your GitHub webhook.',
      );
    }
    return secret;
  }

  /** Setup metadata for the dashboard (does not expose the webhook secret). */
  getWebhookSetup() {
    const apiBase = this.getPublicApiBaseUrl();
    const secretConfigured = Boolean(this.config.get<string>('GITHUB_WEBHOOK_SECRET')?.trim());

    return {
      payloadUrl: `${apiBase}/integrations/github/webhook`,
      secretConfigured,
      contentType: 'application/json',
      events: ['pull_request'],
      instructions:
        'In GitHub, open the repository linked to this Seam workspace → Settings → Webhooks → Add webhook. ' +
        'Use the payload URL below, content type application/json, event Pull requests, and the same secret as GITHUB_WEBHOOK_SECRET on the API host.',
    };
  }

  private getPublicApiBaseUrl(): string {
    const explicit = this.config.get<string>('API_URL')?.trim();
    if (explicit) {
      return explicit.replace(/\/+$/, '');
    }
    const port = this.config.get<string>('PORT') ?? '3000';
    return `http://localhost:${port}`;
  }

  async handleWebhook(params: {
    rawBody: Buffer;
    signature256: string | undefined;
    deliveryId: string | undefined;
    event: string | undefined;
  }): Promise<GithubWebhookHandleResult> {
    const secret = this.getSecretOrThrow();
    if (!verifyGithubSignature(secret, params.rawBody, params.signature256)) {
      throw new UnauthorizedException('Invalid GitHub webhook signature');
    }

    const deliveryId = params.deliveryId?.trim();
    if (!deliveryId) {
      throw new UnauthorizedException('Missing X-GitHub-Delivery header');
    }

    const existing = await this.prisma.githubWebhookDelivery.findUnique({
      where: { deliveryId },
      select: { deliveryId: true },
    });
    if (existing) {
      this.logger.debug(`GitHub webhook duplicate delivery id=${deliveryId}`);
      return { ok: true, duplicate: true };
    }

    const event = (params.event ?? '').toLowerCase();
    if (event === 'ping') {
      await this.recordDelivery(deliveryId);
      return { ok: true, ignored: true };
    }

    if (event !== 'pull_request') {
      await this.recordDelivery(deliveryId);
      return { ok: true, ignored: true };
    }

    let payload: { action?: string; repository?: { full_name?: string } };
    try {
      payload = JSON.parse(params.rawBody.toString('utf8')) as typeof payload;
    } catch {
      throw new UnauthorizedException('Invalid JSON webhook body');
    }

    const action = payload.action ?? '';
    if (!PR_SYNC_ACTIONS.has(action)) {
      await this.recordDelivery(deliveryId);
      return { ok: true, ignored: true };
    }

    const fullName = payload.repository?.full_name?.trim();
    if (!fullName) {
      await this.recordDelivery(deliveryId);
      return { ok: true, ignored: true };
    }

    const projectIds = await this.projectRepo.findProjectIdsByGithubRepoFullName(fullName);
    if (projectIds.length === 0) {
      this.logger.warn(`GitHub webhook: no Seam project for repo=${fullName} delivery=${deliveryId}`);
      await this.recordDelivery(deliveryId);
      return { ok: true, ignored: true };
    }

    const queuesDisabled = this.config.get<string>('DISABLE_QUEUES') === 'true';
    if (queuesDisabled) {
      this.logger.error(
        `DISABLE_QUEUES=true — GitHub webhook delivery=${deliveryId} repo=${fullName} will NOT sync. ` +
          'Enable BullMQ/Redis or run manual sync.',
      );
    }

    for (const projectId of projectIds) {
      await this.githubSyncQueue.enqueueSyncProject(projectId);
    }

    await this.recordDelivery(deliveryId);

    this.logger.log(
      `GitHub webhook enqueued PR sync delivery=${deliveryId} repo=${fullName} projects=${projectIds.length} action=${action}`,
    );

    return {
      ok: true,
      queued: !queuesDisabled,
      queuesDisabled,
      projectIds: projectIds.length,
    };
  }

  private async recordDelivery(deliveryId: string): Promise<void> {
    try {
      await this.prisma.githubWebhookDelivery.create({
        data: { deliveryId },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return;
      }
      throw e;
    }
  }

  /** Used when raw body middleware is misconfigured. */
  assertRawBody(rawBody: Buffer | undefined): asserts rawBody is Buffer {
    if (!rawBody) {
      throw new InternalServerErrorException(
        'Request raw body missing; ensure NestFactory.create(..., { rawBody: true }).',
      );
    }
  }
}
