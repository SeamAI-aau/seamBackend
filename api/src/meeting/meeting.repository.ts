import { Meeting, MeetingStatus, Transcript } from '@prisma/client';

export interface IMeetingRepository {
  create(data: {
    title: string;
    audioUrl: string;
    projectId: string;
  }): Promise<Meeting>;

  findByProject(projectId: string): Promise<Meeting[]>;

  findById(id: string): Promise<Meeting | null>;

  updateStatus(id: string, status: MeetingStatus): Promise<Meeting>;

  addTranscript(meetingId: string, version: number, content: string, diarization: any): Promise<Transcript>;

  delete(id: string): Promise<void>;

  existsProcessingInProject(projectId: string): Promise<boolean>;
}