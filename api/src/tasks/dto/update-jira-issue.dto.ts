import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateJiraIssueDto {
  @ApiPropertyOptional({
    description: 'New issue summary/title in Jira.',
    example: 'Fix upload retry logic',
  })
  summary?: string;

  @ApiPropertyOptional({
    description: 'Priority name (as shown in Jira), e.g. Highest/High/Medium/Low/Lowest.',
    example: 'High',
  })
  priorityName?: string;

  @ApiPropertyOptional({
    description: 'Jira assignee accountId. Set null to unassign (when permitted by Jira).',
    example: '557058:abc123',
    nullable: true,
  })
  assigneeAccountId?: string | null;
}
