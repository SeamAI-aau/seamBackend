@Injectable()
export class MeetingService {
  constructor(
    @Inject(MEETING_REPOSITORY)
    private readonly meetingRepo: IMeetingRepository,
    private readonly projectRepo: IProjectRepository,
    private readonly cloudinaryService: CloudinaryService,
    private readonly aiService: AIService,
    private readonly taskRepo: ITaskRepository,
    private readonly logger: Logger,
  ) {}

  async uploadMeeting(projectId: string, userId: string, audioUrl: string) {
  const project = await this.projectRepo.findById(projectId);

  if (!project) {
    throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
  }

  if (project.ownerId !== userId) {
    throw new AppException(ErrorCode.FORBIDDEN, 'Only owner can upload meeting', 403);
  }

  const meeting = await this.meetingRepo.create({
    title: `Meeting - ${new Date().toISOString()}`,
    audioUrl,
    projectId,
  });

  await this.meetingQueue.enqueue(meeting.id, meeting.audioUrl);

  return { id: meeting.id };
}


  async processMeeting(meetingId: string, userId: string) {
    const meeting = await this.meetingRepo.findById(meetingId);
    if (!meeting) {
      throw new AppException(ErrorCode.MEETING_NOT_FOUND, 'Meeting not found', 404);
    }

    if (meeting.project.ownerId !== userId) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only owner can process meeting', 403);
    }

    if (meeting.status !== 'UPLOADED') {
      throw new AppException(ErrorCode.INVALID_STATE, 'Meeting cannot be processed', 400);
    }

    const alreadyProcessing =
      await this.meetingRepo.existsProcessingInProject(meeting.projectId);

    if (alreadyProcessing) {
      throw new AppException(ErrorCode.CONFLICT, 'Another meeting is processing', 409);
    }

    await this.meetingRepo.updateStatus(meetingId, 'PROCESSING');

    try {
      const result = await this.aiService.processMeeting(meeting.audioUrl);

      await this.meetingRepo.updateTranscript(meetingId, result.transcript);

      for (const task of result.tasks) {
        await this.taskRepo.create({
          title: task.title,
          description: task.description,
          meetingId,
          status: 'EXTRACTED',
          assigneeId: task.assigneeId ?? null,
        });
      }

      await this.meetingRepo.updateStatus(meetingId, 'TASKS_EXTRACTED');
    } catch (err) {
      await this.meetingRepo.updateStatus(meetingId, 'FAILED');
      throw err;
    }
  }
}
