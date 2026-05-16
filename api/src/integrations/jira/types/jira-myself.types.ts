/** Response from GET /rest/api/3/myself */
export interface JiraMyselfResponse {
  accountId: string;
  displayName?: string;
  emailAddress?: string;
}

export interface JiraTransition {
  id: string;
  name: string;
  to: { id: string; name: string; statusCategory?: { name?: string } };
}

export interface JiraTransitionsResponse {
  transitions: JiraTransition[];
}
