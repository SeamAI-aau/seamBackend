import { JiraProposalAction } from '@prisma/client';
import type { WorkerTaskPayload } from '../dto/worker-result.dto';

const ISSUE_KEY_RE = /^[A-Z][A-Z0-9]+-\d+$/i;

export interface DerivedJiraProposal {
  jiraProposalAction: JiraProposalAction | null;
  jiraProposalIssueKey: string | null;
  jiraProposalTransitionId: string | null;
  jiraProposalTargetStatus: string | null;
}

/**
 * Maps ai-engine task fields to stored proposal metadata (no Jira calls until dev approve).
 */
export function deriveJiraProposal(task: WorkerTaskPayload): DerivedJiraProposal {
  const issueKey = (task.jiraIssueKey ?? task.task_id ?? '').trim().toUpperCase();
  const targetStatus = (task.suggested_status ?? task.jiraProposalTargetStatus ?? '').trim();
  const transitionId = (task.jiraProposalTransitionId ?? '').trim() || null;
  const explicitAction = task.jiraAction?.trim().toLowerCase();

  if (explicitAction === 'transition' && issueKey && ISSUE_KEY_RE.test(issueKey)) {
    return {
      jiraProposalAction: JiraProposalAction.TRANSITION,
      jiraProposalIssueKey: issueKey,
      jiraProposalTransitionId: transitionId,
      jiraProposalTargetStatus: targetStatus || null,
    };
  }

  if (explicitAction === 'create') {
    return {
      jiraProposalAction: JiraProposalAction.CREATE,
      jiraProposalIssueKey: null,
      jiraProposalTransitionId: null,
      jiraProposalTargetStatus: null,
    };
  }

  if (issueKey && ISSUE_KEY_RE.test(issueKey)) {
    const current = (task.current_status ?? '').trim();
    const impliesTransition =
      !!targetStatus && (!current || targetStatus.toLowerCase() !== current.toLowerCase());

    if (impliesTransition || transitionId) {
      return {
        jiraProposalAction: JiraProposalAction.TRANSITION,
        jiraProposalIssueKey: issueKey,
        jiraProposalTransitionId: transitionId,
        jiraProposalTargetStatus: targetStatus || null,
      };
    }
  }

  return {
    jiraProposalAction: JiraProposalAction.CREATE,
    jiraProposalIssueKey: null,
    jiraProposalTransitionId: null,
    jiraProposalTargetStatus: null,
  };
}
