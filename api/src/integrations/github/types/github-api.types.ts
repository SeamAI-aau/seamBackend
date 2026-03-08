/** GitHub OAuth token response */
export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope?: string;
  refresh_token?: string;
  expires_in?: number;
}

/** Minimal user from GitHub API */
export interface GitHubUser {
  login: string;
  id: number;
  avatar_url?: string;
}

/** PR from GitHub API (subset we use) */
export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  draft: boolean;
  html_url: string;
  user: GitHubUser | null;
  created_at: string;
  updated_at: string;
  requested_reviewers?: GitHubUser[];
}

/** Parsed repo owner/name from URL */
export interface RepoIdentifier {
  owner: string;
  repo: string;
}

/** Commit from GitHub API */
export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string };
    committer: { date: string };
  };
  author?: GitHubUser | null;
}
