import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Comma-separated origins from `CORS_ORIGINS`, e.g.
 * `https://app.example.com,http://localhost:5173,chrome-extension://abcdef123456`
 */
export function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isDevOpenCors(allowlist: string[]): boolean {
  return allowlist.length === 0 && process.env.NODE_ENV !== 'production';
}

/**
 * Origin check for HTTP (Express) and Socket.IO.
 * - Dev, empty allowlist: reflect any origin (legacy behavior).
 * - Prod or allowlist set: only listed origins; requests with no `Origin` still allowed (non-browser).
 */
export function corsOriginDelegate(
  allowlist: string[],
): (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void {
  const devOpen = isDevOpenCors(allowlist);

  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (devOpen) {
      callback(null, true);
      return;
    }
    if (allowlist.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  };
}

export function buildHttpCorsOptions(corsOriginsRaw: string | undefined): CorsOptions {
  const allowlist = parseCorsOrigins(corsOriginsRaw);
  const devOpen = isDevOpenCors(allowlist);

  if (devOpen) {
    return { origin: true, credentials: true };
  }

  return {
    origin: corsOriginDelegate(allowlist),
    credentials: true,
  };
}

export function buildSocketIoCorsOptions(corsOriginsRaw: string | undefined): {
  origin: ReturnType<typeof corsOriginDelegate> | boolean;
  credentials: boolean;
} {
  const allowlist = parseCorsOrigins(corsOriginsRaw);
  const devOpen = isDevOpenCors(allowlist);

  if (devOpen) {
    return { origin: true, credentials: true };
  }

  return {
    origin: corsOriginDelegate(allowlist),
    credentials: true,
  };
}
