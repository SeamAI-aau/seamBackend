import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from 'nestjs-pino';
import { MeetingStatus, ProjectMemberStatus, Role, TaskStatus, type Prisma } from '@prisma/client';
import { CloudinaryService } from '../infrastracture/cloudinary/cloudinary.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { NotificationService } from '../notification/notification.service';
import type { WorkerResultPayload } from './dto/worker-result.dto';
import { deriveJiraProposal } from './utils/derive-jira-proposal.util';
import { WORKER_RESULT_STATUS_SUCCESS } from './constants/meeting.constants';
import { NOTIFICATION_TYPES } from '../notification/constants/notification-types';

/**
 * Persists callback results from ai-engine-2 (or bridge): transcript + extracted tasks,
 * or marks meeting as FAILED when processing reports an error.
 * Tasks with assigneeId from NLP are auto-assigned (status SENT_TO_DEVELOPER)
 * so developers can approve/decline immediately. Tasks without assignee stay EXTRACTED;
 * project owner and Scrum Master members are notified to assign someone.
 * After successful transcription, deletes the meeting recording from Cloudinary
 * for security and storage (the Meeting record is kept).
 */
@Injectable()
export class MeetingProcessingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly activityLog: ActivityLogService,
    private readonly notification: NotificationService,
    private readonly logger: Logger,
  ) {}

  async handleWorkerResult(meetingId: string, payload: WorkerResultPayload): Promise<void> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      this.logger.warn({ meetingId }, 'Worker result for unknown meeting');
      throw new Error('Meeting not found');
    }

    if (meeting.status === MeetingStatus.TASKS_EXTRACTED) {
      this.logger.warn({ meetingId }, 'Meeting already processed; skipping');
      return;
    }

    const isFailure =
      payload.status !== WORKER_RESULT_STATUS_SUCCESS ||
      (payload.error != null && payload.error !== '');

    if (isFailure) {
      await this.prisma.meeting.update({
        where: { id: meetingId },
        data: { status: MeetingStatus.FAILED },
      });
      this.logger.warn(
        { meetingId, error: payload.error },
        'Meeting processing failed; status set to FAILED',
      );
      return;
    }

    if (typeof payload.transcript !== 'string') {
      await this.prisma.meeting.update({
        where: { id: meetingId },
        data: { status: MeetingStatus.FAILED },
      });
      this.logger.warn({ meetingId }, 'Invalid worker payload: missing transcript string');
      return;
    }

    const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
    const projectId = await this.persistTranscriptAndTasks(meetingId, { ...payload, tasks });
    this.logger.log({ meetingId }, 'Transcript and tasks saved');

    const unassignedTaskCount = tasks.filter(
      (t) => !(typeof t.assigneeId === 'string' && t.assigneeId.trim()),
    ).length;
    if (unassignedTaskCount > 0) {
      await this.notifyScrumMastersOfUnassignedTasks(
        projectId,
        meetingId,
        unassignedTaskCount,
      );
    }

    const autoAssignedTasks = await this.prisma.task.findMany({
      where: { meetingId, assigneeId: { not: null } },
      select: { id: true, title: true, assigneeId: true },
    });
    for (const t of autoAssignedTasks) {
      if (t.assigneeId) {
        this.activityLog
          .log({
            projectId,
            userId: undefined,
            action: 'task.assigned',
            entityType: 'Task',
            entityId: t.id,
            metadata: { title: t.title, assigneeId: t.assigneeId, source: 'nlp_worker' },
          })
          .catch(() => {
            // ignore activity log errors
          });

        this.notification
          .notify({
            userId: t.assigneeId,
            type: 'task_assigned',
            title: `New task: ${t.title}`,
            body: `A new task was extracted from a meeting and assigned to you: "${t.title}".`,
            metadata: { taskId: t.id, projectId },
          })
          .catch(() => {
            // ignore notification errors
          });
      }
    }

    await this.deleteRecordingFromCloudinary(meetingId, meeting.audioPublicId);
  }

  /**
   * Notifies project owner and active project members with role Scrum Master when
   * extracted tasks have no assignee (EXTRACTED — assignee required before approve/decline).
   */
  private async notifyScrumMastersOfUnassignedTasks(
    projectId: string,
    meetingId: string,
    pendingCount: number,
  ): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (!project) {
      this.logger.warn({ projectId, meetingId }, 'Project not found for SM pending-task notify');
      return;
    }

    const recipientIds = new Set<string>();
    recipientIds.add(project.ownerId);

    const members = await this.prisma.projectMember.findMany({
      where: { projectId, status: ProjectMemberStatus.ACTIVE, userId: { not: null } },
      include: { user: { select: { id: true, role: true } } },
    });
    for (const m of members) {
      if (m.userId && m.user?.role === Role.SCRUM_MASTER) {
        recipientIds.add(m.userId);
      }
    }

    const title =
      pendingCount === 1 ? 'Task needs assignee' : `${pendingCount} tasks need assignees`;
    const body =
      pendingCount === 1
        ? 'A task from a processed meeting has no assignee. Assign a developer so they can review and approve or reject.'
        : `${pendingCount} tasks from a processed meeting have no assignees. Assign developers so they can review and approve or reject.`;

    this.activityLog
      .log({
        projectId,
        userId: undefined,
        action: 'meeting.tasks_pending_assignment',
        entityType: 'Meeting',
        entityId: meetingId,
        metadata: { pendingTaskCount: pendingCount },
      })
      .catch(() => {
        // ignore activity log errors
      });

    for (const userId of recipientIds) {
      this.notification
        .notify({
          userId,
          type: NOTIFICATION_TYPES.TASKS_PENDING_ASSIGNMENT,
          title,
          body,
          metadata: { meetingId, projectId, pendingTaskCount: pendingCount },
        })
        .catch(() => {
          // ignore notification errors
        });
    }
  }

  /**
   * Deletes the meeting recording file from Cloudinary after successful transcription.
   * The Meeting record is kept; only the audio asset is removed for security and storage.
   */
  private async deleteRecordingFromCloudinary(
    meetingId: string,
    audioPublicId: string | null,
  ): Promise<void> {
    if (!audioPublicId?.trim()) return;
    try {
      await this.cloudinaryService.deleteByPublicId(audioPublicId);
      this.logger.log({ meetingId }, 'Meeting recording deleted from Cloudinary');
    } catch (err) {
      this.logger.warn(
        { meetingId, publicId: audioPublicId, err },
        'Failed to delete meeting recording from Cloudinary; meeting and transcript are saved',
      );
    }
  }

  private async persistTranscriptAndTasks(
    meetingId: string,
    payload: WorkerResultPayload,
  ): Promise<string> {
    let projectId = '';
    await this.prisma.$transaction(async (tx) => {
      const meeting = await tx.meeting.findUnique({
        where: { id: meetingId },
        select: { projectId: true },
      });
      if (!meeting) return;
      projectId = meeting.projectId;

      await tx.meeting.update({
        where: { id: meetingId },
        data: { status: MeetingStatus.PROCESSING },
      });

      const latest = await tx.transcript.findFirst({
        where: { meetingId },
        orderBy: { version: 'desc' },
      });
      const nextVersion = latest ? latest.version + 1 : 1;

      const transcriptContent = typeof payload.transcript === 'string' ? payload.transcript : '';
      const transcript = await tx.transcript.create({
        data: {
          meetingId,
          version: nextVersion,
          content: transcriptContent,
          diarization: (payload.diarization ?? {}) as Prisma.InputJsonValue,
        },
      });

      if (Array.isArray(payload.tasks) && payload.tasks.length > 0) {
        await tx.task.createMany({
          data: payload.tasks.map((task) => {
            const proposal = deriveJiraProposal(task);
            return {
              meetingId,
              transcriptId: transcript.id,
              title: task.title,
              description: task.description ?? null,
              status: task.assigneeId ? TaskStatus.SENT_TO_DEVELOPER : TaskStatus.EXTRACTED,
              assigneeId: task.assigneeId ?? null,
              confidenceScore:
                typeof task.confidence === 'number' && !Number.isNaN(task.confidence)
                  ? task.confidence
                  : null,
              jiraProposalAction: proposal.jiraProposalAction,
              jiraProposalIssueKey: proposal.jiraProposalIssueKey,
              jiraProposalTransitionId: proposal.jiraProposalTransitionId,
              jiraProposalTargetStatus: proposal.jiraProposalTargetStatus,
            };
          }),
        });
      }

      const blockers = payload.blockers ?? [];
      if (blockers.length > 0) {
        await tx.transcriptBlocker.createMany({
          data: blockers.map((b) => ({
            meetingId,
            projectId: meeting.projectId,
            category: b.category ?? null,
            message: b.message,
          })),
        });
      }

      const meetingUpdate: {
        status: MeetingStatus;
        durationSeconds?: number;
        participants?: object;
      } = {
        status: MeetingStatus.TASKS_EXTRACTED,
      };
      if (payload.meeting?.durationSeconds != null && payload.meeting.durationSeconds > 0) {
        meetingUpdate.durationSeconds = payload.meeting.durationSeconds;
      }
      if (Array.isArray(payload.meeting?.participants) && payload.meeting.participants.length > 0) {
        meetingUpdate.participants = payload.meeting.participants as object;
      }

      await tx.meeting.update({
        where: { id: meetingId },
        data: meetingUpdate,
      });
    });
    return projectId;
  }
}
