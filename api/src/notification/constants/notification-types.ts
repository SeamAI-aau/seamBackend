/**
 * Notification types for in-app and email delivery.
 * Used by browser and VS Code dashboards.
 */
export const NOTIFICATION_TYPES = {
  INVITATION_SENT: 'invitation_sent',
  INVITATION_ACCEPTED: 'invitation_accepted',
  INVITATION_CANCELLED: 'invitation_cancelled',
  TASK_ASSIGNED: 'task_assigned',
  TASK_APPROVED: 'task_approved',
  TASK_DECLINED: 'task_declined',
  BLOCKER_DETECTED: 'blocker_detected',
  MEETING_UPLOADED: 'meeting_uploaded',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

/** Types that should also trigger an email */
export const EMAIL_ENABLED_TYPES: NotificationType[] = [
  NOTIFICATION_TYPES.INVITATION_SENT,
  NOTIFICATION_TYPES.TASK_ASSIGNED,
  NOTIFICATION_TYPES.BLOCKER_DETECTED,
];
