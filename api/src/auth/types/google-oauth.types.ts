export type GoogleOAuthIntent = 'login' | 'signup';

export type GoogleOAuthStatePayload = {
  purpose: 'google_auth';
  intent: GoogleOAuthIntent;
  role?: 'SCRUM_MASTER' | 'DEVELOPER';
  nonce: string;
};

export type GoogleTokenResponse = {
  access_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  refresh_token?: string;
};

export type GoogleUserInfo = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
};
