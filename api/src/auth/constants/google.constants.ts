export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

/** OpenID + email/profile for sign-in and account creation. */
export const GOOGLE_SCOPES = ['openid', 'email', 'profile'] as const;
