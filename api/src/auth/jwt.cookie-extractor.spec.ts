import type { Request } from 'express';
import { cookieTokenExtractor } from './jwt.cookie-extractor';

describe('cookieTokenExtractor', () => {
  it('returns access token when it exists and is non-empty', () => {
    const req = {
      cookies: { accessToken: 'jwt-token-value' },
    } as Request;

    expect(cookieTokenExtractor(req)).toBe('jwt-token-value');
  });

  it('returns null when request has no cookies', () => {
    const req = {} as Request;
    expect(cookieTokenExtractor(req)).toBeNull();
  });

  it('returns null for empty or invalid token value', () => {
    const reqEmpty = { cookies: { accessToken: '' } } as Request;
    const reqObject = { cookies: { accessToken: { t: 'x' } } } as unknown as Request;

    expect(cookieTokenExtractor(reqEmpty)).toBeNull();
    expect(cookieTokenExtractor(reqObject)).toBeNull();
  });
});
