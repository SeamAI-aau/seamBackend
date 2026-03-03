import { Prisma } from '@prisma/client';
import { WorkerTaskPayload } from './workerTaskPayload';

export interface WorkerResultPayload {
  transcript: string;
  diarization: typeof Prisma.JsonNull | Prisma.InputJsonValue;
  tasks: WorkerTaskPayload[];
}