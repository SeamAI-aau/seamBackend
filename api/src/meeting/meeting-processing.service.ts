import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from 'nestjs-pino';
import {
  JiraProposalAction,
  MeetingStatus,
  ProjectMemberStatus,
  Role,
  TaskSource,
  TaskStatus,
  type Prisma,
} from '@prisma/client';
import { CloudinaryService } from '../infrastracture/cloudinary/cloudinary.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { NotificationService } from '../notification/notification.service';
import type {
  WorkerResultPayload,
  WorkerSummaryPayload,
  WorkerTaskPayload,
  WorkerTransitionedTaskPayload,
} from './dto/worker-result.dto';
import { deriveJiraProposal } from './utils/derive-jira-proposal.util';
import { WORKER_RESULT_STATUS_SUCCESS } from './constants/meeting.constants';
import { NOTIFICATION_TYPES } from '../notification/constants/notification-types';
import { PROJECT_REPOSITORY } from '../project/types/project.tokens';
import type { IProjectRepository } from '../project/types/project.repository';


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
    @Inject(PROJECT_REPOSITORY) private readonly projectRepo: IProjectRepository,
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
      const failureReason =
        typeof payload.error === 'string' && payload.error.trim()
          ? payload.error.trim()
          : 'AI engine reported failure';
      await this.prisma.meeting.update({
        where: { id: meetingId },
        data: {
          status: MeetingStatus.FAILED,
          lastProcessingError: failureReason.slice(0, 8000),
        },
      });
      this.logger.warn(
        { meetingId, error: failureReason },
        'Meeting processing failed; status set to FAILED',
      );
      return;
    }

    if (typeof payload.transcript !== 'string') {
      const failureReason = 'Invalid worker payload: missing transcript string';
      await this.prisma.meeting.update({
        where: { id: meetingId },
        data: {
          status: MeetingStatus.FAILED,
          lastProcessingError: failureReason,
        },
      });
      this.logger.warn({ meetingId }, failureReason);
      return;
    }

    const incomingTasks = this.resolveIncomingTasks(payload);
    const normalizedPre = await this.normalizeNewTasks(incomingTasks, meeting.projectId);
    const normalizedTasks = await this.filterAssignableTaskAssignees(
      meeting.projectId,
      normalizedPre,
    );
    this.logger.log(
      {
        meetingId,
        incomingTasks: incomingTasks.length,
        normalizedTasks: normalizedTasks.length,
        assignedTasks: normalizedTasks.filter((t) => t.assigneeId).length,
        unassignedTasks: normalizedTasks.filter((t) => !t.assigneeId).length,
        hasSummary: Boolean(payload.summary),
      },
      'Worker payload normalized for persistence',
    );

    this.logger.log(
      {
        meetingId,
        incomingTasksPayload: JSON.stringify(incomingTasks),
        normalizedTasksPayload: JSON.stringify(normalizedTasks),
      },
      'Worker tasks payloads (normalized)'
    );
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
        select: { projectId: true, createdById: true },
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
      const summary = this.normalizeSummary(payload.summary);
      const transcript = await tx.transcript.create({
        data: {
          meetingId,
          version: nextVersion,
          content: transcriptContent,
          diarization: {} as Prisma.InputJsonValue,
          summary: summary ? (summary as Prisma.InputJsonValue) : undefined,
          insights: insights.length > 0 ? (insights as Prisma.InputJsonValue) : undefined,
          suggestedActions:
            suggestedActions.length > 0
              ? (suggestedActions as Prisma.InputJsonValue)
              : undefined,
        },
      });

      if (normalizedTasks.length > 0) {
        await tx.task.createMany({
          data: normalizedTasks.map((task) => ({
            projectId: meeting.projectId,
            createdById: meeting.createdById,
            source: TaskSource.MEETING_EXTRACTION,
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
      const blockerRows = blockers
        .map((b) => {
          const description = typeof b?.description === 'string' ? b.description.trim() : '';
          if (!description) return null;
          const severity = typeof b?.severity === 'string' ? b.severity.trim() : null;
          return { description, severity };
        })
        .filter((b): b is { description: string; severity: string | null } => Boolean(b));
      if (blockerRows.length > 0) {
        await tx.transcriptBlocker.createMany({
          data: blockerRows.map((b) => ({
            meetingId,
            projectId: meeting.projectId,
            category: b.severity ?? null,
            message: b.description,
          })),
        });
      }

      const meetingUpdate: {
        status: MeetingStatus;
        lastProcessingError: string | null;
      } = {
        status: MeetingStatus.TASKS_EXTRACTED,
        lastProcessingError: null,
      };

      await tx.meeting.update({
        where: { id: meetingId },
        data: meetingUpdate,
      });
    });
    return projectId;
  }

  private async filterAssignableTaskAssignees<T extends { assigneeId: string | null }>(
    projectId: string,
    tasks: T[],
  ): Promise<T[]> {
    const filtered: T[] = [];
    for (const task of tasks) {
      if (!task.assigneeId) {
        filtered.push(task);
        continue;
      }
      const allowed = await this.projectRepo.canAssignTasksToUser(projectId, task.assigneeId);
      if (!allowed) {
        this.logger.warn(
          { projectId, assigneeId: task.assigneeId },
          'Dropped NLP task assignee who is not an active project member',
        );
        filtered.push({ ...task, assigneeId: null });
        continue;
      }
      filtered.push(task);
    }
    return filtered;
  }

  private async normalizeNewTasks(
    tasks: Array<WorkerTaskPayload | WorkerTransitionedTaskPayload>,
    projectId?: string,
  ): Promise<
    Array<{
      title: string;
      description: string | null;
      assigneeId: string | null;
      confidenceScore: number | null;
      jiraIssueKey: string | null;
      jiraProposalAction: JiraProposalAction | null;
      jiraProposalIssueKey: string | null;
      jiraProposalTransitionId: string | null;
      jiraProposalTargetStatus: string | null;
    }>
  > {
    if (!Array.isArray(tasks)) {
      return [];
    }

    const out: Array<{
      title: string;
      description: string | null;
      assigneeId: string | null;
      confidenceScore: number | null;
      jiraIssueKey: string | null;
      jiraProposalAction: JiraProposalAction | null;
      jiraProposalIssueKey: string | null;
      jiraProposalTransitionId: string | null;
      jiraProposalTargetStatus: string | null;
    }> = [];
    const assigneeDirectory = projectId
      ? await this.loadAssigneeDirectory(projectId)
      : [];

    for (const task of tasks) {
      if (!task || typeof task !== 'object') continue;

      const taskPayload = task as WorkerTaskPayload;
      const title = (taskPayload.title ?? '').trim();
      const description = (taskPayload.description ?? '').trim();
      const assigneeId = await this.resolveAssigneeId(
        taskPayload.assigneeId,
        taskPayload.assignee,
        projectId,
        assigneeDirectory,
      );
      const confidenceScore = this.normalizeConfidence(taskPayload.confidence);
      const jiraIssueKey =
        typeof taskPayload.jiraIssueKey === 'string' && taskPayload.jiraIssueKey.trim()
          ? taskPayload.jiraIssueKey.trim()
          : typeof taskPayload.task_id === 'string' && taskPayload.task_id.trim()
          ? taskPayload.task_id.trim()
          : null;
      const jiraProposal = deriveJiraProposal(taskPayload);

      const item = {
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

      if (item.title && item.title.trim().length > 0) out.push(item);
    }

    return out;
  }

  private resolveIncomingTasks(
    payload: WorkerResultPayload,
  ): Array<WorkerTaskPayload | WorkerTransitionedTaskPayload> {
    if (Array.isArray(payload.tasks) && payload.tasks.length > 0) {
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

  private async resolveAssigneeId(
    assigneeId?: string,
    assignee?: string,
    projectId?: string,
    assigneeDirectory?: AssigneeDirectoryEntry[],
  ): Promise<string | null> {
    if (this.isUuid(assigneeId)) {
      return assigneeId!.trim();
    }
    if (this.isUuid(assignee)) {
      return assignee!.trim();
    }

    if (!projectId || !assignee || typeof assignee !== 'string') return null;

    const target = assignee.trim().toLowerCase();
    if (!target) return null;

    try {
      const members = assigneeDirectory ?? (await this.loadAssigneeDirectory(projectId));
      const exact = this.matchAssigneeByExactToken(target, members);
      if (exact) return exact;
      const fuzzy = this.matchAssigneeByUniqueContains(target, members);
      if (fuzzy) return fuzzy;
    } catch (err) {
      this.logger.warn({ projectId, assignee, err }, 'Failed to resolve assignee name to project member');
      return null;
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

  private normalizeSummary(summary?: WorkerSummaryPayload | null): {
    summary: string;
    key_decisions?: string[];
    meeting_sentiment?: string;
    main_topic?: string;
  } | null {
    if (!summary || typeof summary !== 'object') {
      return null;
    }

    const summaryText = typeof summary.summary === 'string' ? summary.summary.trim() : '';
    const keyDecisions = this.normalizeStringList(summary.key_decisions);
    const meetingSentiment =
      typeof summary.meeting_sentiment === 'string' ? summary.meeting_sentiment.trim() : '';
    const mainTopic = typeof summary.main_topic === 'string' ? summary.main_topic.trim() : '';

    if (!summaryText && keyDecisions.length === 0 && !meetingSentiment && !mainTopic) {
      return null;
    }

    const normalized: {
      summary: string;
      key_decisions?: string[];
      meeting_sentiment?: string;
      main_topic?: string;
    } = {
      summary: summaryText,
    };

    if (keyDecisions.length > 0) {
      normalized.key_decisions = keyDecisions;
    }
    if (meetingSentiment) {
      normalized.meeting_sentiment = meetingSentiment;
    }
    if (mainTopic) {
      normalized.main_topic = mainTopic;
    }

    return normalized;
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

  private async loadAssigneeDirectory(projectId: string): Promise<AssigneeDirectoryEntry[]> {
    const members = await this.projectRepo.findMembersByProject(projectId);
    const directory: AssigneeDirectoryEntry[] = [];
    for (const member of members) {
      const user = member.user;
      if (!member.userId || !user) continue;
      directory.push({
        id: user.id,
        name: (user.name ?? '').trim().toLowerCase(),
        email: (user.email ?? '').trim().toLowerCase(),
        emailLocalPart: (user.email ?? '').split('@')[0]?.trim().toLowerCase() ?? '',
      });
    }
    return directory;
  }

  private matchAssigneeByExactToken(
    target: string,
    directory: AssigneeDirectoryEntry[],
  ): string | null {
    for (const entry of directory) {
      if (entry.name && entry.name === target) return entry.id;
      if (entry.email && entry.email === target) return entry.id;
      if (entry.emailLocalPart && entry.emailLocalPart === target) return entry.id;
    }
    return null;
  }

  private matchAssigneeByUniqueContains(
    target: string,
    directory: AssigneeDirectoryEntry[],
  ): string | null {
    const matches = directory.filter((entry) => {
      if (entry.name && entry.name.includes(target)) return true;
      if (entry.email && entry.email.includes(target)) return true;
      return false;
    });

    if (matches.length === 1) {
      return matches[0].id;
    }

    if (matches.length > 1) {
      this.logger.warn(
        {
          assignee: target,
          candidateUserIds: matches.map((m) => m.id),
        },
        'Assignee resolution ambiguous; leaving task unassigned',
      );
    }

    return null;
  }
}

type AssigneeDirectoryEntry = {
  id: string;
  name: string;
  email: string;
  emailLocalPart: string;
};
