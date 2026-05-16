/** Single project from GET /rest/api/3/project/search */
export interface JiraProjectSearchItem {
  id: string;
  key: string;
  name: string;
  projectTypeKey?: string;
  avatarUrls?: Record<string, string>;
}

/** Paginated response from Jira project search */
export interface JiraProjectSearchResponse {
  startAt: number;
  maxResults: number;
  total: number;
  isLast: boolean;
  values: JiraProjectSearchItem[];
}

/** Normalized project returned by Seam API */
export interface JiraAvailableProjectSummary {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string | null;
  avatarUrl: string | null;
}

export interface JiraAvailableProjectsResult {
  items: JiraAvailableProjectSummary[];
  startAt: number;
  maxResults: number;
  total: number;
  isLast: boolean;
}
