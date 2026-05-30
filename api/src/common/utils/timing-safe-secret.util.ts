import * as crypto from 'crypto';

/** Constant-time comparison for shared webhook/worker secrets. */
export function timingSafeSecretEqual(
  provided: string | undefined,
  expected: string | undefined,
): boolean {
  if (!provided || !expected) {
    return false;
  }
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}
