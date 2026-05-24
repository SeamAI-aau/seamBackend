import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { PoolConfig } from 'pg';

function parseSslMode(connectionString: string): string | undefined {
  try {
    const url = new URL(connectionString.replace(/^postgres:/, 'postgresql:'));
    return url.searchParams.get('sslmode')?.toLowerCase() ?? undefined;
  } catch {
    return undefined;
  }
}

function connectionUsesTls(connectionString: string): boolean {
  const sslmode = parseSslMode(connectionString);
  if (!sslmode) {
    return process.env.DATABASE_SSL === 'true';
  }
  return sslmode !== 'disable' && sslmode !== 'allow';
}

/** Resolve Aiven / managed-Postgres CA bundle (api/src/certs/ca.pem, copied to dist/certs on build). */
export function resolveDatabaseCaCertPath(): string | undefined {
  const explicit = process.env.DATABASE_SSL_CA_PATH?.trim();
  if (explicit && existsSync(explicit)) {
    return explicit;
  }

  const nodeExtra = process.env.NODE_EXTRA_CA_CERTS?.trim();
  if (nodeExtra && existsSync(nodeExtra)) {
    return nodeExtra;
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
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const config: PoolConfig = { connectionString };

  if (!connectionUsesTls(connectionString)) {
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

  const sslmode = parseSslMode(connectionString);
  if (sslmode === 'verify-full' || sslmode === 'verify-ca') {
    throw new Error(
      `DATABASE_URL uses sslmode=${sslmode} but no CA file was found. ` +
        'Add api/src/certs/ca.pem (Aiven CA) or set DATABASE_SSL_CA_PATH to its absolute path.',
    );
  }

  // sslmode=require (e.g. some managed providers): TLS without custom CA
  config.ssl = {
    rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
  };

  return config;
}
