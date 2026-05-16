/**
 * Notification types for in-app and email delivery.
 * Used by browser and VS Code dashboards.
 */
export const NOTIFICATION_TYPES = {
  INVITATION_SENT: 'invitation_sent',
  INVITATION_ACCEPTED: 'invitation_accepted',
  INVITATION_CANCELLED: 'invitation_cancelled',
  /** User was removed from a project after accepting membership. */
  MEMBER_REMOVED: 'member_removed',
  TASK_ASSIGNED: 'task_assigned',
  TASK_APPROVED: 'task_approved',
  TASK_DECLINED: 'task_declined',
  /** Meeting pipeline saved tasks with no NLP assignee — SM should assign before dev approve flow. */
  TASKS_PENDING_ASSIGNMENT: 'tasks_pending_assignment',
  BLOCKER_DETECTED: 'blocker_detected',
  MEETING_UPLOADED: 'meeting_uploaded',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

/** Types that should also trigger an email */
export const EMAIL_ENABLED_TYPES: NotificationType[] = [
  NOTIFICATION_TYPES.INVITATION_SENT,
  NOTIFICATION_TYPES.BLOCKER_DETECTED,
];
