import type { TaskStatus } from '@prisma/client';

/** Legacy placeholder meetings from pre-migration manual tasks; used to filter dashboards and cleanup. */
export const MANUAL_TASK_PLACEHOLDER_AUDIO_URL = 'https://placeholder.seam.local/manual-task';

/** Valid task lifecycle: EXTRACTED → SENT_TO_DEVELOPER → APPROVED | REJECTED → (APPROVED → SYNCED via Jira) */
export const TASK_STATUS_VALUES: TaskStatus[] = [
  'EXTRACTED',
  'SENT_TO_DEVELOPER',
  'APPROVED',
  'REJECTED',
  'SYNCED',
];
