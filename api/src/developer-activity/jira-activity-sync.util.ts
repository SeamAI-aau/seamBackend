/** Maps Jira changelog field names to stored developer-activity types. */
export function jiraActivityTypeForChangelogField(field: string): string | null {
  const f = field.toLowerCase();
  if (f === 'status') return 'jira_status_change';
  if (f === 'assignee') return 'jira_assignee_change';
  return null;
}

/** Jira JQL date format: yyyy-MM-dd */
export function toJiraJqlDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}
