export const JIRA_SCOPES = [
  'read:jira-user',
  'read:jira-work',
  'write:jira-work',
  'offline_access',
] as const;

export const ATLASSIAN_AUTH_URL = 'https://auth.atlassian.com/authorize';
export const ATLASSIAN_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
export const ATLASSIAN_RESOURCES_URL =
  'https://api.atlassian.com/oauth/token/accessible-resources';

/** Buffer in ms before expiry to consider token as "expired" for refresh */
export const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;
