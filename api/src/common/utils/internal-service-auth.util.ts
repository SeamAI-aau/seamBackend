import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { timingSafeSecretEqual } from './timing-safe-secret.util';

const WORKER_SECRET_HEADER = 'x-worker-secret';
const INTERNAL_KEY_HEADER = 'x-internal-key';
const INTERNAL_SECRET_HEADER = 'x-internal-secret';

export type InternalServiceHeaders = {
  [WORKER_SECRET_HEADER]?: string;
  [INTERNAL_KEY_HEADER]?: string;
  [INTERNAL_SECRET_HEADER]?: string;
};

/**
 * Validates ai-engine / worker calls: WORKER_SECRET header and/or INTERNAL_API_KEY + INTERNAL_SECRET pair.
 */
export function ensureInternalServiceAuth(
  config: ConfigService,
  headers: InternalServiceHeaders,
): void {
  const workerSecret = config.get<string>('WORKER_SECRET');
  if (timingSafeSecretEqual(headers[WORKER_SECRET_HEADER], workerSecret)) {
    return;
  }

  const internalKey = config.get<string>('INTERNAL_API_KEY');
  const internalSecret = config.get<string>('INTERNAL_SECRET');
  if (
    timingSafeSecretEqual(headers[INTERNAL_KEY_HEADER], internalKey) &&
    timingSafeSecretEqual(headers[INTERNAL_SECRET_HEADER], internalSecret)
  ) {
    return;
  }

  throw new UnauthorizedException('Invalid internal service credentials');
}
