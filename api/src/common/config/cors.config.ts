import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/** Browser `Origin` headers never include a trailing slash. */
export function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

const DEFAULT_ALLOWED_HEADERS = [
  'Content-Type',
  'Accept',
  'Authorization',
  'X-Requested-With',
];

const DEFAULT_ALLOWED_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

const LOCAL_DASHBOARD_ORIGINS = [
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

/**
 * Comma-separated origins from `CORS_ORIGINS`, e.g.
 * `https://app.example.com,http://localhost:5173,chrome-extension://abcdef123456`
 */
export function parseCorsOrigins(raw: string | undefined): string[] {
  const origins = new Set<string>();

  if (raw?.trim()) {
    for (const part of raw.split(',')) {
      const trimmed = normalizeOrigin(part);
      if (trimmed) origins.add(trimmed);
    }
  }

  const frontendUrl = process.env.FRONTEND_URL?.trim();
  if (frontendUrl) {
    origins.add(normalizeOrigin(frontendUrl));
  }

  // Production-mode local dev often omits CORS_ORIGINS; allow the Vite dashboard.
  if (origins.size === 0 && !frontendUrl && !raw?.trim()) {
    for (const origin of LOCAL_DASHBOARD_ORIGINS) {
      origins.add(origin);
    }
  }

  return [...origins];
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
    if (allowlist.includes(normalizeOrigin(origin))) {
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
    return {
      origin: true,
      credentials: true,
      allowedHeaders: DEFAULT_ALLOWED_HEADERS,
      methods: DEFAULT_ALLOWED_METHODS,
    };
  }

  return {
    origin: corsOriginDelegate(allowlist),
    credentials: true,
    allowedHeaders: DEFAULT_ALLOWED_HEADERS,
    methods: DEFAULT_ALLOWED_METHODS,
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
