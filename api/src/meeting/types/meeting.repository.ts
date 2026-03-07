import type { Meeting, MeetingStatus, Transcript, Task } from '@prisma/client';

export interface MeetingWithTranscriptsAndTasks extends Meeting {
  transcripts: Transcript[];
  tasks: Task[];
}

export interface MeetingWithTaskCount extends Meeting {
  _count: { tasks: number };
}

export interface IMeetingRepository {
  create(data: {
    title: string;
    audioUrl: string;
    audioPublicId?: string | null;
    projectId: string;
  }): Promise<Meeting>;

  findByProject(projectId: string): Promise<Meeting[]>;

  findByProjectWithTaskCount(projectId: string): Promise<MeetingWithTaskCount[]>;

  findById(id: string): Promise<Meeting | null>;

  findByIdWithTranscriptsAndTasks(
    id: string,
  ): Promise<MeetingWithTranscriptsAndTasks | null>;

  updateStatus(id: string, status: MeetingStatus): Promise<Meeting>;

  delete(id: string): Promise<void>;
}
