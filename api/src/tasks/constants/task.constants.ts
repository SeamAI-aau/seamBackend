import type { TaskStatus } from '@prisma/client';

/** Used when creating a manual task (no meeting upload). Enables testing Jira sync before extractor is live. */
export const MANUAL_TASK_PLACEHOLDER_AUDIO_URL = 'https://placeholder.seam.local/manual-task';

/** Valid task lifecycle: EXTRACTED → SENT_TO_DEVELOPER → APPROVED | REJECTED → (APPROVED → SYNCED via Jira) */
export const TASK_STATUS_VALUES: TaskStatus[] = [
  'EXTRACTED',
  'SENT_TO_DEVELOPER',
  'APPROVED',
  'REJECTED',
  'SYNCED',
];
