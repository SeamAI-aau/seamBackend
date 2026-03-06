import type { Prisma } from '@prisma/client';

/**
 * Payload for a single extracted task from the AI worker.
 */
export interface WorkerTaskPayload {
  title: string;
  description?: string;
  assigneeId?: string;
}

/**
 * Payload sent by the Python worker to POST /internal/meetings/:id/result.
 * On success: transcript, diarization, tasks.
 * On failure: status 'failed' and error message.
 */
export interface WorkerResultPayload {
  status: 'success' | 'failed';
  transcript?: string;
  diarization?: typeof Prisma.JsonNull | Prisma.InputJsonValue;
  tasks?: WorkerTaskPayload[];
  error?: string;
}
