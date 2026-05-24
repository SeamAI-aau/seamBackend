import type { CookieOptions, Response } from 'express';

/**
 * Auth cookie policy for JWT httpOnly cookies.
 *
 * | Deployment | Set |
 * |------------|-----|
 * | Local Vite proxy (`/api` → localhost) | leave `AUTH_COOKIE_CROSS_SITE` unset → Lax, not Secure |
 * | DigitalOcean / split origins (dashboard ≠ API host) | `AUTH_COOKIE_CROSS_SITE=true` + HTTPS on both |
 *
 * `secure` is required when `sameSite` is `none`. `trust proxy` must be enabled (see `main.ts`).
 */
export function isAuthCookieCrossSite(): boolean {
  const explicit = process.env.AUTH_COOKIE_CROSS_SITE?.trim().toLowerCase();
  if (explicit === 'true' || explicit === '1') return true;
  if (explicit === 'false' || explicit === '0') return false;
  return process.env.NODE_ENV === 'production';
}

export function buildAuthCookieOptions(): Pick<
  CookieOptions,
  'httpOnly' | 'secure' | 'path' | 'sameSite' | 'domain'
> {
  const crossSite = isAuthCookieCrossSite();
  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim();

  return {
    httpOnly: true,
    path: '/',
    secure: crossSite,
    sameSite: (crossSite ? 'none' : 'lax') as 'none' | 'lax',
    ...(domain ? { domain } : {}),
  };
}

export type AuthTokenCookiePayload = {
  accessToken: string;
  refreshToken: string;
  accessExpiresMs: number;
  refreshExpiresMs: number;
};

export function setAuthCookies(res: Response, tokens: AuthTokenCookiePayload): void {
  const base = buildAuthCookieOptions();
  res.cookie('accessToken', tokens.accessToken, { ...base, maxAge: tokens.accessExpiresMs });
  res.cookie('refreshToken', tokens.refreshToken, { ...base, maxAge: tokens.refreshExpiresMs });
}

export function clearAuthCookies(res: Response): void {
  const clearOpts = buildAuthCookieOptions();
  res.clearCookie('accessToken', clearOpts);
  res.clearCookie('refreshToken', clearOpts);
}
