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

    try {
      await this.prisma.githubWebhookDelivery.create({
        data: { deliveryId },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        this.logger.debug(`GitHub webhook duplicate delivery id=${deliveryId}`);
        return { ok: true, duplicate: true };
      }
      throw e;
    }

    const event = (params.event ?? '').toLowerCase();
    if (event === 'ping') {
      return { ok: true, ignored: true };
    }

    if (event !== 'pull_request') {
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
      return { ok: true, ignored: true };
    }

    const fullName = payload.repository?.full_name?.trim();
    if (!fullName) {
      return { ok: true, ignored: true };
    }

    const projectIds = await this.projectRepo.findProjectIdsByGithubRepoFullName(fullName);
    if (projectIds.length === 0) {
      this.logger.warn(`GitHub webhook: no Seam project for repo=${fullName} delivery=${deliveryId}`);
      return { ok: true, ignored: true };
    }

    for (const projectId of projectIds) {
      await this.githubSyncQueue.enqueueSyncProject(projectId);
    }

    this.logger.log(
      `GitHub webhook enqueued PR sync delivery=${deliveryId} repo=${fullName} projects=${projectIds.length} action=${action}`,
    );

    return { ok: true, queued: true, projectIds: projectIds.length };
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
