import type { Request } from 'express';

export const cookieTokenExtractor = (req: Request): string | null => {
  if (!req?.cookies) return null;
  const token = req.cookies.accessToken;
  return typeof token === 'string' && token.length > 0 ? token : null;
};
