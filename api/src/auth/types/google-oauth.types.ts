import type { Role } from '@prisma/client';

export type GoogleOAuthIntent = 'login' | 'signup';

export type GoogleOAuthStatePayload = {
  purpose: 'google_auth';
  intent: GoogleOAuthIntent;
  role?: Role;
  nonce: string;
};

export type GoogleTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

export type GoogleUserInfo = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
};
