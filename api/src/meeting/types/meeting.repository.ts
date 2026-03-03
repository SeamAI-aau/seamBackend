import { Meeting, MeetingStatus } from '@prisma/client';

export interface IMeetingRepository {
  create(data: { title: string; audioUrl: string; projectId: string }): Promise<Meeting>;

  findByProject(projectId: string): Promise<Meeting[]>;

  findById(id: string): Promise<Meeting | null>;

  updateStatus(id: string, status: MeetingStatus): Promise<Meeting>;

  delete(id: string): Promise<void>;
}
