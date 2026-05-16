/** Repository from GET /user/repos */
export interface GitHubRepoApiItem {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
  description: string | null;
  owner: { login: string };
  updated_at: string;
}

/** Normalized repo returned by Seam API */
export interface GitHubAvailableRepoSummary {
  id: number;
  fullName: string;
  name: string;
  htmlUrl: string;
  private: boolean;
  ownerLogin: string;
  description: string | null;
}

export interface GitHubAvailableReposResult {
  items: GitHubAvailableRepoSummary[];
  page: number;
  perPage: number;
  total: number;
  isLast: boolean;
}
