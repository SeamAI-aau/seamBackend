export interface IMeetingRepository {
  create(data: {
    title: string;
    audioUrl: string;
    projectId: string;
  }): Promise<any>;

  findByProject(projectId: string): Promise<any[]>;

  findById(id: string): Promise<any | null>;

  updateStatus(id: string, status: any): Promise<void>;

  updateTranscript(id: string, transcript: string): Promise<void>;

  delete(id: string): Promise<void>;

  existsProcessingInProject(projectId: string): Promise<boolean>;
}
