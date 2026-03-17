import {
  Controller,
  Post,
  Param,
  UseGuards,
  Body,
  Patch,
  Get,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserType } from '../auth/types/current-user.type';
import { Roles } from '../common/decorators/roles.decorator';
import { Role, TaskStatus } from '@prisma/client';
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
} from '@nestjs/swagger';

import { TaskService } from './task.service';
import { AssignTaskDto } from './dto/assign-task.dto';
import { TaskFilterQueryDto } from './dto/task-filter-query.dto';
import { UpdateJiraIssueDto } from './dto/update-jira-issue.dto';
import { UpdateTaskDraftDto } from './dto/update-task-draft.dto';
import { CreateTaskDto } from './dto/create-task.dto';

@ApiTags('Tasks')
@ApiBearerAuth('access-token')
@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post()
  @ApiOperation({ summary: 'Create a task (manual; creates placeholder meeting/transcript for Jira testing)' })
  @ApiCreatedResponse({
    description: 'Task created with placeholder meeting and transcript. Same shape as GET /tasks/:id.',
    schema: {
      example: {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        title: 'Implement retry backoff for Stripe webhooks',
        description: 'Add exponential backoff with jitter.',
        status: 'SENT_TO_DEVELOPER',
        confidenceScore: null,
        createdAt: '2026-03-06T10:00:00.000Z',
        updatedAt: '2026-03-06T10:00:00.000Z',
        meetingId: 'm1m1m1m1-e5f6-7890-abcd-ef1234567890',
        transcriptId: 't1t1t1t1-e5f6-7890-abcd-ef1234567890',
        jiraIssueKey: null,
        assigneeId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
        meeting: {
          id: 'm1m1m1m1-e5f6-7890-abcd-ef1234567890',
          projectId: 'p1p1p1p1-e5f6-7890-abcd-ef1234567890',
          project: { id: 'p1p1p1p1-e5f6-7890-abcd-ef1234567890', name: 'My Project' },
        },
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
        summary: 'Create and assign in one step',
        value: {
          projectId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          title: 'Implement retry backoff for Stripe webhooks',
          description: 'Add exponential backoff with jitter. Ensure idempotency keys are used.',
          assigneeId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
        },
      },
      unassigned: {
        summary: 'Create without assignee (status EXTRACTED)',
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

  @Post(':id/approve')
  @ApiOperation({ summary: 'Developer approves a task assigned to them' })
  @ApiOkResponse({
    description: 'Task status set to APPROVED; may enqueue Jira sync.',
    schema: { example: { id: 'task-uuid', status: 'APPROVED', title: 'Task title', assigneeId: 'user-uuid' } },
  })
  @ApiBadRequestResponse({ description: 'Invalid state transition (e.g. task not SENT_TO_DEVELOPER).' })
  @ApiForbiddenResponse({ description: 'Only the assigned developer can approve.' })
  @ApiNotFoundResponse({ description: 'Task not found.' })
  approve(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.taskService.approveTask(id, user.userId);
  }

  @Post(':id/decline')
  @ApiOperation({ summary: 'Developer declines a task assigned to them' })
  @ApiOkResponse({
    description: 'Task status set to REJECTED.',
    schema: { example: { id: 'task-uuid', status: 'REJECTED', title: 'Task title' } },
  })
  @ApiBadRequestResponse({ description: 'Invalid state transition.' })
  @ApiForbiddenResponse({ description: 'Only the assigned developer can decline.' })
  @ApiNotFoundResponse({ description: 'Task not found.' })
  decline(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.taskService.declineTask(id, user.userId);
  }

  @Patch(':id/draft')
  @ApiOperation({ summary: 'Developer edits a task draft before approval (pre-Jira)' })
  @ApiOkResponse({
    description: 'Task title/description updated. Only allowed when status is SENT_TO_DEVELOPER and not yet synced to Jira.',
    schema: { example: { id: 'task-uuid', title: 'Updated title', description: 'Updated description', status: 'SENT_TO_DEVELOPER' } },
  })
  @ApiBadRequestResponse({ description: 'Invalid state or task already synced to Jira.' })
  @ApiForbiddenResponse({ description: 'Only the assigned developer can edit the draft.' })
  @ApiNotFoundResponse({ description: 'Task not found.' })
  @ApiBody({ type: UpdateTaskDraftDto })
  updateDraft(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
    @Body() body: UpdateTaskDraftDto,
  ) {
    return this.taskService.updateTaskDraft(id, user.userId, body);
  }

  @Post(':id/send-to-developer')
  @Roles(Role.SCRUM_MASTER)
  @ApiOperation({ summary: 'Scrum Master sends a task to a developer' })
  @ApiOkResponse({
    description: 'Task assigned and status set to SENT_TO_DEVELOPER; assignee is notified.',
    schema: { example: { id: 'task-uuid', status: 'SENT_TO_DEVELOPER', assigneeId: 'user-uuid' } },
  })
  @ApiBadRequestResponse({ description: 'Invalid state transition (e.g. already assigned).' })
  @ApiForbiddenResponse({ description: 'Only Scrum Masters can assign tasks.' })
  @ApiNotFoundResponse({ description: 'Task not found.' })
  @ApiBody({ type: AssignTaskDto })
  sendToDeveloper(
    @Param('id') id: string,
    @Body() body: AssignTaskDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.taskService.sendToDeveloper(id, user, body.assigneeId);
  }

  @Post(':id/unassign')
  @Roles(Role.SCRUM_MASTER)
  @ApiOperation({ summary: 'Scrum Master unassigns a task' })
  @ApiOkResponse({
    description: 'Assignee cleared and status set to EXTRACTED.',
    schema: { example: { id: 'task-uuid', status: 'EXTRACTED', assigneeId: null } },
  })
  @ApiBadRequestResponse({ description: 'Invalid state transition.' })
  @ApiForbiddenResponse({ description: 'Only Scrum Masters can unassign.' })
  @ApiNotFoundResponse({ description: 'Task not found.' })
  unassign(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.taskService.unassignTask(id, user);
  }

  @Patch(':id/jira')
  @ApiOperation({ summary: 'Update the Jira issue fields for a task (server-side)' })
  @ApiOkResponse({
    description: 'Jira issue and local task updated.',
    schema: { example: { success: true, jiraIssueKey: 'PROJ-123', fieldsChanged: ['summary', 'description'] } },
  })
  @ApiBadRequestResponse({ description: 'Task not yet synced to Jira or no fields to update.' })
  @ApiForbiddenResponse({ description: 'Only project owner or assignee can update.' })
  @ApiNotFoundResponse({ description: 'Task not found.' })
  @ApiBody({ type: UpdateJiraIssueDto })
  updateJiraIssue(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
    @Body() body: UpdateJiraIssueDto,
  ) {
    return this.taskService.updateJiraIssue(id, user.userId, body);
  }

  @Get('by-project/:projectId')
  @ApiOperation({ summary: 'List tasks for a project with optional filters' })
  @ApiOkResponse({
    description: 'Paginated list of tasks for the project. Requires project access.',
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
  @ApiForbiddenResponse({ description: 'User does not have access to the project.' })
  getByProject(
    @Param('projectId') projectId: string,
    @Query() query: TaskFilterQueryDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.taskService.getTasksByProject(
      projectId,
      user.userId,
      {
        status: query.status as TaskStatus | undefined,
        assigneeId: query.assigneeId,
      },
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get('by-meeting/:meetingId')
  @ApiOperation({ summary: 'List tasks extracted from a specific meeting' })
  @ApiOkResponse({
    description: 'Paginated list of tasks for the meeting. Requires project access.',
    schema: {
      example: {
        items: [
          {
            id: 'task-uuid',
            title: 'Implement retry backoff',
            status: 'EXTRACTED',
            meeting: { id: 'meeting-uuid', title: 'Sprint planning' },
            assignee: null,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    },
  })
  @ApiForbiddenResponse({ description: 'User does not have access to the project.' })
  @ApiNotFoundResponse({ description: 'Meeting not found.' })
  getByMeeting(
    @Param('meetingId') meetingId: string,
    @Query() query: TaskFilterQueryDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.taskService.getTasksByMeeting(
      meetingId,
      user.userId,
      {
        status: query.status as TaskStatus | undefined,
        assigneeId: query.assigneeId,
      },
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get('my')
  @ApiOperation({ summary: 'List tasks assigned to the current user' })
  @ApiOkResponse({
    description: 'Paginated list of tasks assigned to the current user.',
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
  getMyTasks(
    @CurrentUser() user: CurrentUserType,
    @Query() query: TaskFilterQueryDto,
  ) {
    return this.taskService.getTasksForAssignee(
      user.userId,
      query.status as TaskStatus | undefined,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get('my/grouped')
  @ApiOperation({ summary: 'Get my tasks grouped into active vs completed' })
  @ApiOkResponse({
    description: 'Tasks grouped into active (EXTRACTED, SENT_TO_DEVELOPER) and completed (APPROVED, REJECTED, SYNCED).',
    schema: {
      example: {
        active: [
          { id: 'task-1', title: 'Active task', status: 'SENT_TO_DEVELOPER', meeting: { id: 'm1', title: 'Meeting' }, assignee: { id: 'u1', email: 'd@e.com', name: 'Dev' } },
        ],
        completed: [
          { id: 'task-2', title: 'Done task', status: 'APPROVED', meeting: { id: 'm2', title: 'Meeting' }, assignee: { id: 'u1', email: 'd@e.com', name: 'Dev' } },
        ],
      },
    },
  })
  getMyTasksGrouped(@CurrentUser() user: CurrentUserType) {
    return this.taskService.getMyTasksGrouped(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single task by ID with meeting and project' })
  @ApiOkResponse({
    description: 'Task with meeting and project. Access: project member or assignee.',
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
