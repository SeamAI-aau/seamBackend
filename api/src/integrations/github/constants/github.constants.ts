export const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
export const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
export const GITHUB_API_BASE = 'https://api.github.com';

/** Scopes for OAuth (repo for private repos, public_repo for public only) */
export const GITHUB_SCOPES = ['read:user', 'repo'] as const;

/** Stale PR: open > this many days with no activity */
export const STALE_PR_DAYS = 3;
/** Waiting review: no response for this many days */
export const WAITING_REVIEW_DAYS = 2;
/** Draft PR open too long: this many days */
export const DRAFT_TOO_LONG_DAYS = 5;
