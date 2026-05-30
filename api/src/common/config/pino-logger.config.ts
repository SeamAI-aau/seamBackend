import type { IncomingMessage, ServerResponse } from 'http';
import type { Options } from 'pino-http';

const REDACTED = '[Redacted]';

const SENSITIVE_HEADER_NAMES = new Set([
  'cookie',
  'authorization',
  'x-internal-secret',
  'x-internal-key',
  'x-worker-secret',
]);

const SENSITIVE_BODY_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'refreshtoken',
  'accesstoken',
  'token',
  'client_secret',
  'clientsecret',
]);

function sanitizeHeaders(
  headers: IncomingMessage['headers'] | undefined,
): Record<string, unknown> | undefined {
  if (!headers) return undefined;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_HEADER_NAMES.has(key.toLowerCase()) ? REDACTED : value;
  }
  return out;
}

function sanitizeBody(body: unknown): unknown {
  if (body === null || body === undefined) return body;
  if (typeof body !== 'object') return body;

  if (Array.isArray(body)) {
    return body.map(sanitizeBody);
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    out[key] = SENSITIVE_BODY_KEYS.has(key.toLowerCase()) ? REDACTED : sanitizeBody(value);
  }
  return out;
}

function safeReqSerializer(req: IncomingMessage) {
  return {
    id: (req as IncomingMessage & { id?: string }).id,
    method: req.method,
    url: req.url,
    remoteAddress: req.socket?.remoteAddress,
    remotePort: req.socket?.remotePort,
    headers: sanitizeHeaders(req.headers),
  };
}

function safeResSerializer(res: ServerResponse) {
  return {
    statusCode: res.statusCode,
  };
}

/** Pino HTTP options with secrets redacted from request logs. */
export function buildPinoHttpOptions(): Options {
  return {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',

    transport:
      process.env.NODE_ENV !== 'production'
        ? {
            target: 'pino-pretty',
            options: { singleLine: true },
          }
        : undefined,

    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'req.headers["x-internal-secret"]',
        'req.headers["x-internal-key"]',
        'req.headers["x-worker-secret"]',
        'res.headers["set-cookie"]',
        'req.body.password',
        'req.body.currentPassword',
        'req.body.newPassword',
        'req.body.refreshToken',
        'req.body.accessToken',
        'req.body.token',
        'accessToken',
        'refreshToken',
        'password',
        'passwordHash',
        'tokenHash',
        'client_secret',
        'clientSecret',
      ],
      censor: REDACTED,
    },

    serializers: {
      req: safeReqSerializer,
      res: safeResSerializer,
    },

    genReqId: (req) => {
      const header = req.headers['x-request-id'];
      return (typeof header === 'string' && header) || crypto.randomUUID();
    },

    customProps: (req) => {
      const seamClient = req.headers['x-seam-client'];
      return {
        requestId: (req as IncomingMessage & { id?: string }).id,
        ...(typeof seamClient === 'string' && seamClient ? { seamClient } : {}),
      };
    },

    customReceivedMessage: (req) => `${req.method} ${req.url}`,
  };
}

/** Sanitize arbitrary log context before manual logger calls. */
export function sanitizeLogContext(context: Record<string, unknown>): Record<string, unknown> {
  return sanitizeBody(context) as Record<string, unknown>;
}
