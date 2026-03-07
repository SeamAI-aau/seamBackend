import type { TaskStatus } from '@prisma/client';

/** Valid task lifecycle: EXTRACTED → SENT_TO_DEVELOPER → APPROVED | REJECTED → (APPROVED → SYNCED via Jira) */
export const TASK_STATUS_VALUES: TaskStatus[] = [
  'EXTRACTED',
  'SENT_TO_DEVELOPER',
  'APPROVED',
  'REJECTED',
  'SYNCED',
];
