import type { CookieOptions } from 'express';

/**
 * Auth cookie policy for JWT httpOnly cookies.
 *
 * Local dev (Vite proxy, same-origin): leave `AUTH_COOKIE_CROSS_SITE` unset → Lax, not Secure.
 * Remote dev/staging (dashboard on another host, e.g. Render): set `AUTH_COOKIE_CROSS_SITE=true`
 * → SameSite=None + Secure (required by browsers for cross-site cookies).
 *
 * Does not depend on `NODE_ENV`, so you can keep NODE_ENV=development on Render builds.
 */
export function buildAuthCookieOptions(): Pick<
  CookieOptions,
  'httpOnly' | 'secure' | 'path' | 'sameSite'
> {
  const crossSite =
    process.env.AUTH_COOKIE_CROSS_SITE === 'true' ||
    process.env.AUTH_COOKIE_CROSS_SITE === '1';

  return {
    httpOnly: true,
    path: '/',
    secure: crossSite,
    sameSite: (crossSite ? 'none' : 'lax') as 'none' | 'lax',
  };
}
