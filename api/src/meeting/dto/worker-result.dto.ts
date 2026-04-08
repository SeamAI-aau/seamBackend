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
 * Blocker extracted from transcript by NLP (e.g. risk, dependency, resource).
 * Persisted as TranscriptBlocker and shown next to GitHub blockers on dashboard.
 */
export interface WorkerBlockerPayload {
  /** Optional category for filtering/display (e.g. "risk", "dependency", "resource"). */
  category?: string;
  /** Human-readable blocker description from NLP. */
  message: string;
}

/**
 * Optional meeting metadata from the worker (audio analysis).
 */
export interface WorkerMeetingMetadata {
  durationSeconds?: number;
  participants?: Array<{ userId?: string; email?: string; name?: string }>;
}

/**
 * Payload sent by the Python worker to POST /internal/meetings/:id/result.
 * On success: transcript, diarization, tasks, optional blockers, optional meeting metadata.
 * On failure: status 'failed' and error message.
 */
export interface WorkerResultPayload {
  status: 'success' | 'failed';
  transcript?: string;
  diarization?: typeof Prisma.JsonNull | Prisma.InputJsonValue;
  tasks?: WorkerTaskPayload[];
  /** Blockers extracted from transcript by NLP; persisted and exposed next to GitHub blockers. */
  blockers?: WorkerBlockerPayload[];
  /** Optional meeting metadata (duration, participants from diarization/audio). */
  meeting?: WorkerMeetingMetadata;
  error?: string;
}
