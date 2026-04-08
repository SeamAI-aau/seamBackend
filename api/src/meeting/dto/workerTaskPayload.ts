export interface WorkerTaskPayload {
  title: string;
  description?: string;
  confidenceScore?: number;
  assigneeId?: string;
}
