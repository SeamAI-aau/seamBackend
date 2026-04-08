import type { JiraAccount } from '@prisma/client';

/** JiraAccount without decrypted tokens, for internal use */
export type JiraAccountEntity = JiraAccount;

/** Payload from Atlassian OAuth token endpoint */
export interface AtlassianTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/** Single accessible resource (Jira site) from Atlassian */
export interface AtlassianResource {
  id: string;
  name: string;
  url: string;
  scopes: string[];
  avatarUrl?: string;
}

/** Payload for creating a Jira issue (API 3) */
export interface JiraCreateIssuePayload {
  fields: {
    project: { key: string };
    summary: string;
    description: string;
    issuetype: { name: string };
    assignee?: { id: string };
  };
}

/** Response when creating an issue */
export interface JiraCreateIssueResponse {
  key: string;
  id: string;
  self?: string;
}
