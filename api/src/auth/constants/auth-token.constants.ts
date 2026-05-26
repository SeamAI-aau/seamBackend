/** Runtime-safe token types (matches Prisma `AuthTokenType` enum in schema). */
export const AUTH_TOKEN_TYPE = {
  EMAIL_VERIFICATION: 'EMAIL_VERIFICATION',
  PASSWORD_RESET: 'PASSWORD_RESET',
} as const;

export type AuthTokenPurpose = (typeof AUTH_TOKEN_TYPE)[keyof typeof AUTH_TOKEN_TYPE];

export const EMAIL_VERIFICATION_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
export const EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;
