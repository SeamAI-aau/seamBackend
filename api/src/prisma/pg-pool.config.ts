import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { PoolConfig } from 'pg';

const SSL_QUERY_PARAMS = ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'ssl'] as const;

function toPostgresUrl(connectionString: string): URL {
  return new URL(connectionString.replace(/^postgres:/i, 'postgresql:'));
}

function fromPostgresUrl(url: URL, preferPostgresScheme: boolean): string {
  const protocol = preferPostgresScheme ? 'postgres:' : 'postgresql:';
  const auth =
    url.username !== ''
      ? `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}@`
      : '';
  const port = url.port ? `:${url.port}` : '';
  const query = url.searchParams.toString();
  const qs = query ? `?${query}` : '';
  return `${protocol}//${auth}${url.hostname}${port}${url.pathname}${qs}`;
}

/**
 * `pg-connection-string` resets `ssl` to `{}` when `sslmode` is in the URL, which drops a custom `ca`.
 * Strip SSL query params from the URL and apply TLS via `config.ssl` instead.
 */
export function stripSslQueryParams(connectionString: string): {
  connectionString: string;
  sslmode?: string;
} {
  const preferPostgresScheme = connectionString.toLowerCase().startsWith('postgres:');
  const url = toPostgresUrl(connectionString);
  const sslmode = url.searchParams.get('sslmode')?.toLowerCase() ?? undefined;

  for (const key of SSL_QUERY_PARAMS) {
    url.searchParams.delete(key);
  }

  return {
    connectionString: fromPostgresUrl(url, preferPostgresScheme),
    sslmode,
  };
}

function connectionUsesTls(sslmode: string | undefined): boolean {
  if (sslmode) {
    return sslmode !== 'disable' && sslmode !== 'allow';
  }
  return process.env.DATABASE_SSL === 'true';
}

/** Resolve Aiven / managed-Postgres CA bundle (api/src/certs/ca.pem, copied to dist/certs on build). */
export function resolveDatabaseCaCertPath(): string | undefined {
  const explicit = process.env.DATABASE_SSL_CA_PATH?.trim();
  if (explicit && existsSync(explicit)) {
    return explicit;
  }

  const cwd = process.cwd();
  const candidates = [
    join(__dirname, 'certs', 'ca.pem'),
    join(__dirname, '..', 'certs', 'ca.pem'),
    join(cwd, 'api', 'dist', 'certs', 'ca.pem'),
    join(cwd, 'api', 'src', 'certs', 'ca.pem'),
    join(cwd, 'api', 'certs', 'ca.pem'),
    join(cwd, 'src', 'certs', 'ca.pem'),
    join(cwd, 'certs', 'ca.pem'),
  ];

  return candidates.find((p) => existsSync(p));
}

export function createPgPoolConfig(): PoolConfig {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const { connectionString, sslmode } = stripSslQueryParams(rawUrl);
  const config: PoolConfig = {
    connectionString,
    max: parseInt(process.env.DATABASE_POOL_SIZE ?? '5', 10),
  };

  if (!connectionUsesTls(sslmode)) {
    return config;
  }

  const caPath = resolveDatabaseCaCertPath();
  if (caPath) {
    config.ssl = {
      ca: readFileSync(caPath, 'utf8'),
      rejectUnauthorized: true,
    };
    return config;
  }

  const effectiveMode = sslmode ?? (process.env.DATABASE_SSL === 'true' ? 'require' : undefined);
  if (effectiveMode === 'verify-full' || effectiveMode === 'verify-ca') {
    throw new Error(
      `Database TLS (${effectiveMode}) requires a CA file but none was found. ` +
        'Add api/src/certs/ca.pem (Aiven CA) or set DATABASE_SSL_CA_PATH.',
    );
  }

  config.ssl = {
    rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
  };

  return config;
}
