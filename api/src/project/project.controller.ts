import {
  Body,
  Controller,
  Delete,
  Param,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProjectService } from './project.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { CurrentUserType } from '../auth/types/current-user.type';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { DashboardFilterDto } from './dto/dashboard-filter.dto';
import { BlockersFilterDto } from './dto/blockers-filter.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { Role } from '@prisma/client';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiQuery,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Projects')
@ApiBearerAuth('access-token')
@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project (Scrum Master only)' })
  @ApiCreatedResponse({
    description: 'Project created successfully.',
    schema: {
      example: {
        id: 'proj_123',
        name: 'Payments Squad — Q2 Standups',
        description: 'Tracks standup tasks for the Payments squad.',
        ownerId: 'user_1',
        createdAt: '2026-03-06T10:00:00.000Z',
        updatedAt: '2026-03-06T10:00:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Validation error (e.g. missing or too long name).',
    schema: {
      example: {
        statusCode: 400,
        message: ['name must be shorter than or equal to 100 characters'],
        error: 'Bad Request',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'User is not a Scrum Master.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Only Scrum Masters can create projects',
        error: 'Forbidden',
      },
    },
  })
  @ApiBody({
    description: 'Payload to create a new project.',
    type: CreateProjectDto,
    examples: {
      default: {
        summary: 'Basic project',
        value: {
          name: 'Payments Squad — Q2 Standups',
          description: 'Tracks standup action items and blockers for the Payments squad.',
        },
      },
    },
  })
  createProject(@CurrentUser() user: CurrentUserType, @Body() body: CreateProjectDto) {
    return this.projectService.createProject(user, body);
  }

  @Get()
  @ApiOperation({ summary: 'List projects the current user owns or is a member of' })
  @ApiOkResponse({
    description: 'Paginated list of projects.',
    schema: {
      example: {
        items: [
          { id: 'proj_1', name: 'Payments Squad — Q2 Standups' },
          { id: 'proj_2', name: 'Infra — Incident Reviews' },
        ],
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid pagination parameters.',
    schema: {
      example: {
        statusCode: 400,
        message: ['page must not be less than 1'],
        error: 'Bad Request',
      },
    },
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (1-based). Defaults to 1.',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of items per page. Defaults to 20, max 100.',
    example: 20,
  })
  getProjects(@CurrentUser() user: CurrentUserType, @Query() query: PaginationQueryDto) {
    return this.projectService.getUserProjects(user.userId, query.page ?? 1, query.limit ?? 20);
  }

  @Get(':id/dashboard')
  @Roles(Role.SCRUM_MASTER)
  @ApiOperation({
    summary: 'Get Scrum Master project dashboard',
    description:
      'Aggregated KPIs, recent tasks, recent meetings, and blockers for the given project. Accessible to Scrum Masters only.',
  })
  @ApiOkResponse({
    description: 'Dashboard data for the project.',
    schema: {
      example: {
        project: { id: 'proj_123', name: 'Payments Squad — Q2 Standups' },
        taskCountsByStatus: {
          SENT_TO_DEVELOPER: 5,
          APPROVED: 10,
          REJECTED: 2,
          SYNCED: 3,
        },
        kpis: {
          totalTasks: 20,
          tasksApproved: 10,
          tasksRejected: 2,
          tasksPending: 5,
          tasksCompleted: 13,
          sprintProgressPercent: 65,
          openBlockersCount: 3,
        },
        recentTasks: {
          items: [
            {
              id: 'task_1',
              title: 'Fix checkout error',
              status: 'SENT_TO_DEVELOPER',
              assignee: { id: 'dev_1', email: 'dev@example.com', name: 'Dev One' },
            },
          ],
          total: 10,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
        recentMeetings: {
          items: [
            {
              id: 'meeting_1',
              title: 'Daily standup',
              status: 'COMPLETED',
              createdAt: '2026-03-10T09:00:00.000Z',
              durationSeconds: 900,
              participants: ['dev1@example.com', 'dev2@example.com'],
            },
          ],
          total: 5,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
        blockers: {
          github: {
            items: [
              {
                id: 'blocker_1',
                source: 'github',
                message: 'CI failed on main branch',
                type: 'CI_FAILURE',
              },
            ],
            total: 1,
            page: 1,
            limit: 50,
            totalPages: 1,
          },
          transcript: {
            items: [
              {
                id: 'blocker_2',
                source: 'transcript',
                message: 'Dependency on external API not ready',
                category: 'dependency',
              },
            ],
            total: 1,
            page: 1,
            limit: 50,
            totalPages: 1,
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Current user is not a Scrum Master or not part of the project.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Access denied',
        error: 'Forbidden',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Project not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Project not found',
        error: 'Not Found',
      },
    },
  })
  getDashboard(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
    @Query() query: DashboardFilterDto,
  ) {
    return this.projectService.getProjectDashboard(id, user.userId, query);
  }

  @Get(':id/dashboard/developer')
  @ApiOperation({
    summary: 'Get developer dashboard for a project',
    description:
      'Personal dashboard for the authenticated user on a project: tasks assigned to you, ' +
      'recent project meetings, merged GitHub/transcript blockers, and sprint KPIs. ' +
      'Accessible to project owner or active member. No request body. ' +
      'Supported query params: fromDate, toDate, recentTasksLimit, recentMeetingsLimit, blockersLimit ' +
      '(assigneeId, status, and pagination fields on DashboardFilterDto are ignored on this route).',
  })
  @ApiOkResponse({
    description:
      'Developer dashboard. myTasks are filtered to the current user. ' +
      'sprintProgressPercent is project-wide (completed vs total tasks). blockers merges GitHub and transcript sources.',
    schema: {
      example: {
        project: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'Payments Squad — Q2 Standups',
        },
        kpis: {
          myTasksCount: 8,
          sprintProgressPercent: 70,
        },
        myTasks: {
          items: [
            {
              id: 'task-uuid',
              title: 'Refactor payment service',
              description: 'Extract shared retry logic.',
              status: 'SENT_TO_DEVELOPER',
              meetingId: 'meeting-uuid',
              assigneeId: 'user-uuid',
              createdAt: '2026-04-10T08:00:00.000Z',
              updatedAt: '2026-04-12T14:00:00.000Z',
              meeting: { id: 'meeting-uuid', title: 'Daily standup' },
              assignee: { id: 'user-uuid', email: 'dev1@example.com', name: 'Dev One' },
            },
          ],
          total: 8,
        },
        recentMeetings: {
          items: [
            {
              id: 'meeting-uuid',
              title: 'Daily standup',
              status: 'COMPLETED',
              createdAt: '2026-04-10T09:00:00.000Z',
              durationSeconds: 900,
              participants: ['dev1@example.com', 'dev2@example.com'],
            },
          ],
          total: 5,
        },
        blockers: {
          items: [
            {
              id: 'blocker-uuid-1',
              source: 'github',
              createdAt: '2026-04-09T12:00:00.000Z',
              message: 'CI failed on main branch',
              type: 'CI_FAILURE',
              pullRequest: { id: 'pr-uuid', title: 'Fix webhook handler', githubId: 123 },
            },
            {
              id: 'blocker-uuid-2',
              source: 'transcript',
              createdAt: '2026-04-08T15:30:00.000Z',
              message: 'Blocked on external API credentials',
              category: 'dependency',
              meeting: { id: 'meeting-uuid', title: 'Sprint planning' },
            },
          ],
          total: 2,
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'User is not a member or owner of the project.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Access denied',
        error: 'Forbidden',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Project not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Project not found',
        error: 'Not Found',
      },
    },
  })
  getDeveloperDashboard(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
    @Query() query: DashboardFilterDto,
  ) {
    return this.projectService.getDeveloperDashboard(id, user.userId, query);
  }

  @Get(':id/blockers')
  @UseGuards(RolesGuard)
  @Roles(Role.SCRUM_MASTER)
  @ApiOperation({
    summary: 'List project blockers (Scrum Master only)',
    description:
      'Unified, paginated list of GitHub and transcript blockers for the project, with optional filters.',
  })
  @ApiOkResponse({
    description: 'Paginated list of unified blockers.',
    schema: {
      example: {
        items: [
          {
            id: 'blocker_1',
            source: 'github',
            message: 'CI failed on main branch',
            type: 'CI_FAILURE',
          },
          {
            id: 'blocker_2',
            source: 'transcript',
            message: 'Dependency on external API not ready',
            category: 'dependency',
          },
        ],
        total: 2,
        page: 1,
        limit: 50,
        totalPages: 1,
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Current user is not owner or member of the project.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Access denied',
        error: 'Forbidden',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Project not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Project not found',
        error: 'Not Found',
      },
    },
  })
  @ApiQuery({
    name: 'source',
    required: false,
    description: 'Filter blockers by source: "github" or "transcript".',
    example: 'github',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (1-based). Defaults to 1.',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of blockers per page. Defaults to 50, max 200.',
    example: 50,
  })
  @ApiQuery({
    name: 'fromDate',
    required: false,
    description: 'Only include blockers created on or after this ISO date.',
    example: '2026-03-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filter transcript blockers by category, such as "risk" or "dependency".',
    example: 'dependency',
  })
  getBlockers(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
    @Query() query: BlockersFilterDto,
  ) {
    return this.projectService.getProjectBlockers(id, user.userId, query);
  }

  @Get(':id/config')
  @ApiOperation({
    summary: 'Get project configuration and integrations',
    description:
      'Returns minimal project info, configured GitHub/Jira integrations, and members with their project roles.',
  })
  @ApiOkResponse({
    description: 'Project config, integrations, and members.',
    schema: {
      example: {
        project: { id: 'proj_123', name: 'Payments Squad — Q2 Standups' },
        integrations: {
          github: {
            repoUrl: 'https://github.com/acme/payments-standups',
            repoName: 'payments-standups',
            organization: 'acme',
          },
          jira: {
            projectKey: 'PAY',
            lastActivitySyncAt: '2026-04-14T12:00:00.000Z',
          },
        },
        integrationMapping: {
          totalActiveMembers: 2,
          githubMappedCount: 2,
          jiraMappedCount: 1,
          message:
            'Connect GitHub/Jira integrations or set githubUsername on profile. Jira requires OAuth + refresh-profile for accountId.',
        },
        members: [
          {
            userId: 'owner_1',
            name: 'Jane Doe',
            email: 'scrum.master@example.com',
            role: 'SCRUM_MASTER',
            githubUsername: 'jane-doe-dev',
            githubMapped: true,
            jiraMapped: true,
            projectRole: 'owner',
            status: 'ACTIVE',
          },
          {
            userId: 'dev_1',
            name: 'Dev One',
            email: 'dev1@example.com',
            role: 'DEVELOPER',
            githubUsername: 'dev-one',
            githubMapped: true,
            jiraMapped: false,
            projectRole: 'member',
            status: 'ACTIVE',
          },
        ],
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'User is not owner or member of the project.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Access denied',
        error: 'Forbidden',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Project not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Project not found',
        error: 'Not Found',
      },
    },
  })
  getConfig(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.projectService.getProjectConfig(id, user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single project by id (must be owner or member)' })
  @ApiOkResponse({
    description: 'Full project entity.',
    schema: {
      example: {
        id: 'proj_123',
        name: 'Payments Squad — Q2 Standups',
        description: 'Tracks standup tasks for the Payments squad.',
        ownerId: 'user_1',
        githubRepoUrl: 'https://github.com/acme/payments-standups',
        jiraProjectKey: 'PAY',
        createdAt: '2026-03-06T10:00:00.000Z',
        updatedAt: '2026-03-06T10:00:00.000Z',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'User is not owner or member of the project.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Access denied',
        error: 'Forbidden',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Project not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Project not found',
        error: 'Not Found',
      },
    },
  })
  getProject(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.projectService.getProject(id, user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update project fields (owner only)' })
  @ApiOkResponse({
    description: 'Project updated. Only provided fields are changed.',
    schema: {
      example: {
        id: 'proj_123',
        name: 'Payments Squad — Q2 Standups',
        description: 'Tracks standup tasks.',
        ownerId: 'user_1',
        githubRepoUrl: 'https://github.com/acme/repo',
        jiraProjectKey: 'PROJ',
        createdAt: '2026-03-06T10:00:00.000Z',
        updatedAt: '2026-03-06T10:00:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Validation error.' })
  @ApiForbiddenResponse({ description: 'Only project owner can update.' })
  @ApiNotFoundResponse({ description: 'Project not found.' })
  @ApiBody({
    type: UpdateProjectDto,
    examples: {
      jiraKey: {
        summary: 'Set Jira project key',
        value: { jiraProjectKey: 'PROJ' },
      },
      full: {
        summary: 'Update several fields',
        value: {
          name: 'New name',
          description: 'New description',
          githubRepoUrl: 'https://github.com/org/repo',
          jiraProjectKey: 'TEAM',
        },
      },
    },
  })
  updateProject(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
    @Body() body: UpdateProjectDto,
  ) {
    return this.projectService.updateProject(id, user.userId, body);
  }

  @Post(':id/members')
  @ApiOperation({
    summary: 'Add a project member by email',
    description:
      'Adds a new active member (if the user already exists) or creates a pending invitation. Only the project owner can call this.',
  })
  @ApiOkResponse({
    description: 'Member added or invitation created.',
    schema: {
      example: {
        id: 'member_1',
        email: 'developer@example.com',
        status: 'PENDING',
        userId: null,
        pending: true,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Validation error (invalid email).',
    schema: {
      example: {
        statusCode: 400,
        message: ['email must be an email'],
        error: 'Bad Request',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Current user is not the project owner.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Only owner can add members',
        error: 'Forbidden',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Project not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Project not found',
        error: 'Not Found',
      },
    },
  })
  @ApiConflictResponse({
    description:
      'Email already has a pending invite or is already an active member. Use `details.memberId` with DELETE /projects/{id}/members/{memberId} to cancel a pending invite.',
    schema: {
      examples: {
        pendingInvite: {
          summary: 'Pending invitation already exists',
          value: {
            statusCode: 409,
            message: 'An invitation for this email is already pending',
            error: 'CONFLICT',
            details: {
              memberId: 'member_pending_1',
              email: 'developer@example.com',
            },
          },
        },
        activeMember: {
          summary: 'User is already an active member',
          value: {
            statusCode: 409,
            message: 'User is already a member of this project',
            error: 'CONFLICT',
            details: {
              memberId: 'member_active_1',
              email: 'developer@example.com',
            },
          },
        },
      },
    },
  })
  @ApiBody({
    description: 'Email payload to add or invite a member.',
    type: AddMemberDto,
    examples: {
      invite: {
        summary: 'Invite a developer by email',
        value: {
          email: 'developer@example.com',
        },
      },
    },
  })
  addMemberByEmail(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
    @Body() body: AddMemberDto,
  ) {
    return this.projectService.addMemberByEmail(id, user.userId, body.email);
  }

  @Post(':id/invitations/accept')
  @ApiOperation({
    summary: 'Accept a project invitation by email',
    description:
      'Accepts a pending invitation for the given project. The email must match the currently authenticated user.',
  })
  @ApiOkResponse({
    description: 'Invitation accepted and membership activated.',
    schema: {
      example: {
        id: 'member_1',
        projectId: 'proj_123',
        email: 'developer@example.com',
        status: 'ACTIVE',
        userId: 'user_123',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Validation error (invalid email).',
    schema: {
      example: {
        statusCode: 400,
        message: ['email must be an email'],
        error: 'Bad Request',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Email does not match the current user or user already a member.',
    schema: {
      examples: {
        wrongEmail: {
          summary: 'Email does not match current user',
          value: {
            statusCode: 403,
            message: 'You can only accept an invitation sent to your own email',
            error: 'Forbidden',
          },
        },
        alreadyMember: {
          summary: 'User already a member of the project',
          value: {
            statusCode: 409,
            message: 'You are already a member of this project',
            error: 'Conflict',
          },
        },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Project or pending invitation not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'No pending invitation found for this email',
        error: 'Not Found',
      },
    },
  })
  @ApiBody({
    description: 'Email payload matching the invitation.',
    type: AcceptInviteDto,
    examples: {
      default: {
        summary: 'Accept invitation',
        value: {
          email: 'developer@example.com',
        },
      },
    },
  })
  acceptInvite(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
    @Body() body: AcceptInviteDto,
  ) {
    return this.projectService.acceptInvite(id, user.userId, body.email);
  }

  @Delete(':id/members/:memberId')
  @ApiOperation({
    summary: 'Remove a member or cancel a pending invite',
    description:
      'Only the project owner can call this. Works for **PENDING** invites (cancel) and **ACTIVE** members (revoke access after they accepted). ' +
      'Pass **`ProjectMember.id`** from `GET /projects/{id}/members` → `items[].id`. ' +
      'For backwards compatibility, an active member’s `userId` is also accepted. The project owner cannot be removed.',
  })
  @ApiParam({
    name: 'id',
    description: 'Project UUID.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiParam({
    name: 'memberId',
    description:
      'ProjectMember row UUID (`items[].id` from GET /projects/{id}/members). Pending invites use this id because `userId` is null.',
    example: 'f6a7b8c9-d0e1-2345-f012-456789012345',
  })
  @ApiOkResponse({
    description: 'Member or invitation removed.',
    schema: {
      examples: {
        cancelPending: {
          summary: 'Cancelled pending invite',
          value: {
            id: 'f6a7b8c9-d0e1-2345-f012-456789012345',
            projectId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            email: 'developer@example.com',
            status: 'PENDING',
            userId: null,
            createdAt: '2026-05-14T10:00:00.000Z',
          },
        },
        removeActive: {
          summary: 'Removed accepted (ACTIVE) member',
          value: {
            id: 'f6a7b8c9-d0e1-2345-f012-456789012345',
            projectId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            email: 'developer@example.com',
            status: 'ACTIVE',
            userId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
            createdAt: '2026-05-01T10:00:00.000Z',
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Current user is not the project owner.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Only owner can remove members or cancel invites',
        error: 'Forbidden',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Member or invite not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Member or invite not found',
        error: 'Not Found',
      },
    },
  })
  removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.projectService.removeMember(id, memberId, user.userId);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a project',
    description:
      'Permanently deletes the project and cascaded data (meetings, tasks, integrations metadata, etc.). Only the project owner.',
  })
  @ApiParam({
    name: 'id',
    description: 'Project UUID.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiOkResponse({
    description: 'Project deleted.',
    schema: { example: { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', deleted: true } },
  })
  @ApiForbiddenResponse({
    description: 'Only the project owner can delete the project.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Only project owner can delete project',
        error: 'FORBIDDEN',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Project not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Project not found',
        error: 'PROJECT_NOT_FOUND',
      },
    },
  })
  deleteProject(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.projectService.deleteProject(id, user.userId);
  }

  @Get(':id/members')
  @ApiOperation({
    summary: 'List project members',
    description:
      'Paginated list of project members and pending invitations. Accessible to project owner and members.',
  })
  @ApiOkResponse({
    description: 'Paginated list of project members.',
    schema: {
      example: {
        items: [
          {
            id: 'member_1',
            email: 'scrum.master@example.com',
            status: 'ACTIVE',
            userId: 'user_1',
            user: {
              id: 'user_1',
              email: 'scrum.master@example.com',
              name: 'Jane Doe',
              role: 'SCRUM_MASTER',
            },
          },
          {
            id: 'member_2',
            email: 'developer@example.com',
            status: 'PENDING',
            userId: null,
            user: null,
          },
        ],
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'User is not owner or member of the project.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Access denied',
        error: 'Forbidden',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Project not found.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Project not found',
        error: 'Not Found',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid pagination parameters.',
    schema: {
      example: {
        statusCode: 400,
        message: ['page must not be less than 1'],
        error: 'Bad Request',
      },
    },
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (1-based). Defaults to 1.',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of items per page. Defaults to 20, max 100.',
    example: 20,
  })
  getProjectMembers(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
    @Query() query: PaginationQueryDto,
  ) {
    return this.projectService.getProjectMembers(
      id,
      user.userId,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }
}
