import { Controller, Post, Param, UseGuards, Body, Patch, Get, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserType } from '../auth/types/current-user.type';
import { TaskStatus } from '@prisma/client';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';

import { TaskService } from './task.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskOutcomeDto } from './dto/update-task-outcome.dto';
import { ReassignTaskDto } from './dto/reassign-task.dto';
import { TaskListQueryDto } from './dto/task-list-query.dto';

@ApiTags('Tasks')
@ApiBearerAuth('access-token')
@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a task (testing only)',
    description:
      'Creates a task with a placeholder meeting and transcript. For Jira integration testing only; in production tasks are created from the meeting extractor. No role restriction: any authenticated user with project access can create. Not intended for production use.',
  })
  @ApiCreatedResponse({
    description: 'Task created. Same shape as GET /tasks/:id.',
    schema: {
      example: {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        title: 'Implement retry backoff for Stripe webhooks',
        description: 'Add exponential backoff with jitter.',
        status: 'SENT_TO_DEVELOPER',
        meetingId: 'm1...',
        transcriptId: 't1...',
        jiraIssueKey: null,
        assigneeId: 'b2c3d4e5-...',
        meeting: { id: 'm1...', projectId: 'p1...', project: { id: 'p1...', name: 'My Project' } },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Validation error (e.g. invalid projectId or title).' })
  @ApiForbiddenResponse({ description: 'User does not have access to the project.' })
  @ApiNotFoundResponse({ description: 'Project not found.' })
  @ApiBody({
    type: CreateTaskDto,
    examples: {
      withAssignee: {
        summary: 'Create and assign',
        value: {
          projectId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          title: 'Implement retry backoff for Stripe webhooks',
          description: 'Add exponential backoff with jitter.',
          assigneeId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
        },
      },
      unassigned: {
        summary: 'Create without assignee',
        value: {
          projectId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          title: 'Add unit tests for payment service',
        },
      },
    },
  })
  create(@Body() body: CreateTaskDto, @CurrentUser() user: CurrentUserType) {
    return this.taskService.createTask(user.userId, body);
  }

  @Get('grouped')
  @ApiOperation({
    summary: 'Get my tasks grouped (active vs completed)',
    description:
      'Tasks assigned to the current user, grouped into active (EXTRACTED, SENT_TO_DEVELOPER) and completed (APPROVED, REJECTED, SYNCED). ' +
      'Active tasks are sorted by createdAt descending; completed by updatedAt descending. ' +
      'No request body or query params. Use GET /tasks with assigneeId=me when you need pagination or project filters.',
  })
  @ApiOkResponse({
    description:
      'Two arrays of task objects with meeting and assignee relations. Not paginated (up to 200 tasks per group).',
    schema: {
      example: {
        active: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            title: 'Implement retry backoff for Stripe webhooks',
            description: 'Add exponential backoff with jitter.',
            status: 'SENT_TO_DEVELOPER',
            meetingId: 'meeting-uuid',
            assigneeId: 'user-uuid',
            createdAt: '2026-04-10T08:00:00.000Z',
            updatedAt: '2026-04-12T14:00:00.000Z',
            meeting: { id: 'meeting-uuid', title: 'Sprint planning', projectId: 'project-uuid' },
            assignee: { id: 'user-uuid', email: 'dev@example.com', name: 'Dev User' },
          },
        ],
        completed: [
          {
            id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
            title: 'Add unit tests for payment service',
            description: null,
            status: 'APPROVED',
            meetingId: 'meeting-uuid-2',
            assigneeId: 'user-uuid',
            createdAt: '2026-04-01T08:00:00.000Z',
            updatedAt: '2026-04-05T16:00:00.000Z',
            meeting: { id: 'meeting-uuid-2', title: 'Daily standup', projectId: 'project-uuid' },
            assignee: { id: 'user-uuid', email: 'dev@example.com', name: 'Dev User' },
          },
        ],
      },
    },
  })
  getMyTasksGrouped(@CurrentUser() user: CurrentUserType) {
    return this.taskService.getMyTasksGrouped(user.userId);
  }

  @Get()
  @ApiOperation({
    summary: 'List tasks with filters',
    description:
      "Paginated list. At least one of projectId, meetingId, or assigneeId is required. Use assigneeId=me for current user's tasks. When filtering by another user's assigneeId, projectId or meetingId is required. Access: project member when projectId/meetingId is set.",
  })
  @ApiOkResponse({
    schema: {
      example: {
        items: [
          {
            id: 'task-uuid',
            title: 'Implement retry backoff',
            status: 'SENT_TO_DEVELOPER',
            meeting: { id: 'meeting-uuid', title: 'Sprint planning' },
            assignee: { id: 'user-uuid', email: 'dev@example.com', name: 'Dev User' },
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    },
  })
  @ApiBadRequestResponse({
    description: "When filtering by another user's assigneeId without projectId/meetingId.",
  })
  @ApiForbiddenResponse({ description: 'User does not have access to the project.' })
  @ApiNotFoundResponse({ description: 'Meeting not found (when meetingId is used).' })
  list(@Query() query: TaskListQueryDto, @CurrentUser() user: CurrentUserType) {
    const assigneeIdResolved = query.assigneeId === 'me' ? user.userId : query.assigneeId;
    return this.taskService.getTasks(user.userId, {
      projectId: query.projectId,
      meetingId: query.meetingId,
      assigneeId: assigneeIdResolved,
      status: query.status as TaskStatus | undefined,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update draft and/or set outcome (approve/decline)',
    description:
      'Only the assigned developer can call. Draft and approve are tied: you must have a valid draft (non-empty title) before approving. Three uses: (1) Send only title/description to edit the draft (task must be SENT_TO_DEVELOPER and not yet synced to Jira). (2) Send status: APPROVED to approve — optional title/description in the same request are applied first as the final draft, then status is set to APPROVED and the task is synced to Jira; the task body is never updated after it is approved/synced. (3) Send status: REJECTED to decline. All fields optional; at least one required.',
  })
  @ApiParam({ name: 'id', description: 'Task UUID.' })
  @ApiOkResponse({
    description: 'Updated task or outcome applied.',
    schema: {
      example: {
        id: 'task-uuid',
        status: 'APPROVED',
        title: 'Final title',
        assigneeId: 'user-uuid',
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Invalid state transition; no fields provided; draft edit when already synced; or approve without a title (set draft first or send title in the approve request).',
  })
  @ApiForbiddenResponse({
    description: 'Only the assigned developer can update draft or set outcome.',
  })
  @ApiNotFoundResponse({ description: 'Task not found.' })
  @ApiBody({
    type: UpdateTaskOutcomeDto,
    examples: {
      approve: {
        summary:
          'Approve (optionally send final title/description in same request; applied before Jira sync)',
        value: {
          status: 'APPROVED',
          title: 'Final title for Jira',
          description: 'Final description.',
        },
      },
      decline: {
        summary: 'Decline',
        value: { status: 'REJECTED' },
      },
      draft: {
        summary: 'Edit draft only (must be SENT_TO_DEVELOPER and not yet synced)',
        value: { title: 'Updated title', description: 'Updated description.' },
      },
    },
  })
  updateOutcome(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
    @Body() body: UpdateTaskOutcomeDto,
  ) {
    return this.taskService.updateTaskOutcome(id, user.userId, body);
  }

  @Patch(':id/assign')
  @ApiOperation({
    summary: 'Reassign or unassign task',
    description:
      '**Scrum Master** or **current assignee** can set `assigneeId` to a developer UUID, or unassign (`assigneeId: null`). Assigning from **EXTRACTED** (e.g. meeting tasks without NLP assignee) sets **SENT_TO_DEVELOPER** and notifies the developer (`task_assigned`). Unassign returns the task to **EXTRACTED**.',
  })
  @ApiParam({ name: 'id', description: 'Task UUID.' })
  @ApiOkResponse({
    schema: {
      example: { id: 'task-uuid', status: 'SENT_TO_DEVELOPER', assigneeId: 'new-user-uuid' },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid state transition.' })
  @ApiForbiddenResponse({
    description: 'Only Scrum Master or current assignee can reassign/unassign.',
  })
  @ApiNotFoundResponse({ description: 'Task not found.' })
  @ApiBody({
    type: ReassignTaskDto,
    examples: {
      reassign: {
        summary: 'Reassign to another developer',
        value: { assigneeId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901' },
      },
      unassign: { summary: 'Unassign', value: { assigneeId: null } },
    },
  })
  reassign(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
    @Body() body: ReassignTaskDto,
  ) {
    return this.taskService.reassignTask(id, user, body.assigneeId ?? null);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single task by ID' })
  @ApiParam({ name: 'id', description: 'Task UUID.' })
  @ApiOkResponse({
    schema: {
      example: {
        id: 'task-uuid',
        title: 'Implement retry backoff',
        description: 'Add exponential backoff.',
        status: 'SENT_TO_DEVELOPER',
        meetingId: 'meeting-uuid',
        transcriptId: 'transcript-uuid',
        jiraIssueKey: null,
        assigneeId: 'user-uuid',
        meeting: {
          id: 'meeting-uuid',
          projectId: 'project-uuid',
          project: { id: 'project-uuid', name: 'My Project' },
        },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'User does not have access to the task.' })
  @ApiNotFoundResponse({ description: 'Task not found.' })
  getById(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.taskService.getById(id, user.userId);
  }
}
