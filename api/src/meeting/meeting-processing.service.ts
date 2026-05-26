import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from 'nestjs-pino';
import {
  JiraProposalAction,
  MeetingStatus,
  ProjectMemberStatus,
  Role,
  TaskStatus,
  type Prisma,
} from '@prisma/client';
import { CloudinaryService } from '../infrastracture/cloudinary/cloudinary.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { NotificationService } from '../notification/notification.service';
import type {
  WorkerResultPayload,
  WorkerTaskPayload,
  WorkerTransitionedTaskPayload,
} from './dto/worker-result.dto';
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

    const incomingTasks = this.resolveIncomingTasks(payload);
    const normalizedTasks = this.normalizeNewTasks(incomingTasks);
    const projectId = await this.persistTranscriptAndTasks(meetingId, payload, normalizedTasks);
    this.logger.log({ meetingId }, 'Transcript and tasks saved');

    const unassignedTaskCount = normalizedTasks.filter((t) => !t.assigneeId).length;
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
    normalizedTasks: Array<{
      title: string;
      description: string | null;
      assigneeId: string | null;
      confidenceScore: number | null;
      jiraIssueKey: string | null;
      jiraProposalAction: JiraProposalAction | null;
      jiraProposalIssueKey: string | null;
      jiraProposalTransitionId: string | null;
      jiraProposalTargetStatus: string | null;
    }>,
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
      const insights = this.normalizeStringList(payload.insights);
      const suggestedActions = this.normalizeStringList(payload.suggested_actions);
      const transcript = await tx.transcript.create({
        data: {
          meetingId,
          version: nextVersion,
          content: transcriptContent,
          diarization: {} as Prisma.InputJsonValue,
          insights: insights.length > 0 ? (insights as Prisma.InputJsonValue) : null,
          suggestedActions:
            suggestedActions.length > 0
              ? (suggestedActions as Prisma.InputJsonValue)
              : null,
        },
      });

      if (normalizedTasks.length > 0) {
        await tx.task.createMany({
          data: normalizedTasks.map((task) => ({
            meetingId,
            transcriptId: transcript.id,
            title: task.title,
            description: task.description ?? null,
            status: task.assigneeId ? TaskStatus.SENT_TO_DEVELOPER : TaskStatus.EXTRACTED,
            assigneeId: task.assigneeId ?? null,
            confidenceScore: task.confidenceScore ?? null,
            jiraIssueKey: task.jiraIssueKey ?? null,
            jiraProposalAction: task.jiraProposalAction ?? null,
            jiraProposalIssueKey: task.jiraProposalIssueKey ?? null,
            jiraProposalTransitionId: task.jiraProposalTransitionId ?? null,
            jiraProposalTargetStatus: task.jiraProposalTargetStatus ?? null,
          })),
        });
      }

      const blockers = Array.isArray(payload.blockers) ? payload.blockers : [];
      if (blockers.length > 0) {
        await tx.transcriptBlocker.createMany({
          data: blockers.map((b) => ({
            meetingId,
            projectId: meeting.projectId,
            category: b.severity ?? null,
            message: b.description,
          })),
        });
      }

      const meetingUpdate: {
        status: MeetingStatus;
      } = {
        status: MeetingStatus.TASKS_EXTRACTED,
      };

      await tx.meeting.update({
        where: { id: meetingId },
        data: meetingUpdate,
      });
    });
    return projectId;
  }

  private normalizeNewTasks(
    tasks: Array<WorkerTaskPayload | WorkerTransitionedTaskPayload>,
  ): Array<{
    title: string;
    description: string | null;
    assigneeId: string | null;
    confidenceScore: number | null;
    jiraIssueKey: string | null;
    jiraProposalAction: JiraProposalAction | null;
    jiraProposalIssueKey: string | null;
    jiraProposalTransitionId: string | null;
    jiraProposalTargetStatus: string | null;
  }> {
    if (!Array.isArray(tasks)) {
      return [];
    }

    return tasks
      .map((task) => {
        if (!task || typeof task !== 'object') {
          return null;
        }

        const taskPayload = task as WorkerTaskPayload;
        const title = (taskPayload.title ?? '').trim();
        const description = (taskPayload.description ?? '').trim();
        const assigneeId = this.resolveAssigneeId(taskPayload.assigneeId, taskPayload.assignee);
        const confidenceScore = this.normalizeConfidence(taskPayload.confidence);
        const jiraIssueKey = typeof taskPayload.jiraIssueKey === 'string' && taskPayload.jiraIssueKey.trim()
          ? taskPayload.jiraIssueKey.trim()
          : typeof taskPayload.task_id === 'string' && taskPayload.task_id.trim()
            ? taskPayload.task_id.trim()
            : null;
        const jiraProposal = deriveJiraProposal(taskPayload);

        return {
          title: title || description || 'Extracted task',
          description: description || null,
          assigneeId,
          confidenceScore,
          jiraIssueKey,
          jiraProposalAction: jiraProposal.jiraProposalAction,
          jiraProposalIssueKey: jiraProposal.jiraProposalIssueKey,
          jiraProposalTransitionId: jiraProposal.jiraProposalTransitionId,
          jiraProposalTargetStatus: jiraProposal.jiraProposalTargetStatus,
        };
      })
      .filter((task): task is {
        title: string;
        description: string | null;
        assigneeId: string | null;
        confidenceScore: number | null;
        jiraIssueKey: string | null;
        jiraProposalAction: JiraProposalAction | null;
        jiraProposalIssueKey: string | null;
        jiraProposalTransitionId: string | null;
        jiraProposalTargetStatus: string | null;
      } => Boolean(task && task.title.trim().length > 0));
  }

  private resolveIncomingTasks(
    payload: WorkerResultPayload,
  ): Array<WorkerTaskPayload | WorkerTransitionedTaskPayload> {
    if (Array.isArray(payload.tasks)) {
      return payload.tasks;
    }
    const merged: Array<WorkerTaskPayload | WorkerTransitionedTaskPayload> = [];
    if (Array.isArray(payload.transitioned_tasks)) {
      merged.push(...payload.transitioned_tasks);
    }
    if (Array.isArray(payload.new_tasks)) {
      merged.push(...payload.new_tasks);
    }
    return merged;
  }

  private resolveAssigneeId(
    assigneeId?: string,
    assignee?: string,
  ): string | null {
    if (this.isUuid(assigneeId)) {
      return assigneeId!.trim();
    }
    if (this.isUuid(assignee)) {
      return assignee!.trim();
    }
    return null;
  }

  private normalizeConfidence(confidence: unknown): number | null {
    if (typeof confidence === 'number' && Number.isFinite(confidence)) {
      return confidence;
    }
    const parsed = Number(confidence);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private normalizeStringList(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => (item == null ? '' : String(item)).trim())
      .filter((item) => item.length > 0);
  }

  private isUuid(value?: string): boolean {
    if (!value) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    );
  }
}
