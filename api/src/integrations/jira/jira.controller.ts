import { Controller, Get, Param, Post, Body, Query, UseGuards, Res, Inject } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserType } from '../../auth/types/current-user.type';
import { JiraService } from './jira.service';
import { JiraIssueService } from './jira-issue.service';
import { LinkJiraProjectDto } from './dto/link-jira-project.dto';
import { JiraTransitionIssueDto } from './dto/jira-transition.dto';
import { JiraAvailableProjectsQueryDto } from './dto/jira-available-projects-query.dto';
import {
  JiraAvailableProjectsResponseDto,
} from './dto/jira-available-project-response.dto';
import { PROJECT_REPOSITORY } from '../../project/types/project.tokens';
import type { IProjectRepository } from '../../project/types/project.repository';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Integrations - Jira')
@ApiBearerAuth('access-token')
@Controller('integrations/jira')
export class JiraController {
  constructor(
    private readonly jiraService: JiraService,
    private readonly jiraIssueService: JiraIssueService,
    private readonly config: ConfigService,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: IProjectRepository,
  ) {}

  @Get('connect')
  @ApiOperation({
    summary: 'Start Jira OAuth flow',
    description:
      "Redirects the browser to Atlassian's OAuth consent page. The user signs in and authorizes the app; Atlassian then redirects to your callback URL with a code.",
  })
  @ApiResponse({
    status: 302,
    description: 'Redirect to Atlassian OAuth authorization URL.',
  })
  @UseGuards(JwtAuthGuard)
  connect(@CurrentUser() user: CurrentUserType, @Res() res: Response): void {
    const url = this.jiraService.getAuthorizationUrl(user.userId);
    res.redirect(url);
  }

  @Get('callback')
  @ApiOperation({
    summary: 'OAuth callback (used by Atlassian redirect)',
    description:
      'Exchanges the authorization code for access and refresh tokens, stores them for the user, fetches /myself (accountId for activity mapping), then redirects to your frontend. Do not call this manually.',
  })
  @ApiQuery({
    name: 'code',
    description: 'Authorization code from Atlassian (query param).',
    required: true,
  })
  @ApiQuery({
    name: 'state',
    description: 'State passed to connect (your user id).',
    required: true,
  })
  @ApiResponse({
    status: 302,
    description:
      'Redirect to JIRA_OAUTH_SUCCESS_REDIRECT_URL or http://localhost:8080/oauth-success?provider=jira.',
  })
  @ApiBadRequestResponse({ description: 'Invalid or missing code; OAuth exchange failed.' })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.jiraService.handleCallback(code ?? '', state ?? '');
    const redirectUrl =
      this.config.get<string>('JIRA_OAUTH_SUCCESS_REDIRECT_URL') ??
      'http://localhost:8080/oauth-success?provider=jira';
    res.redirect(redirectUrl);
  }

  @Get('status')
  @ApiOperation({
    summary: 'Check if current user has Jira connected',
    description:
      'Returns whether the authenticated user has completed Jira OAuth and has stored tokens.',
  })
  @ApiOkResponse({
    description: 'Connection status for the current user.',
    schema: {
      example: { connected: true },
      properties: {
        connected: { type: 'boolean', description: 'True if Jira is connected for this user.' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  async getStatus(@CurrentUser() user: CurrentUserType): Promise<{ connected: boolean }> {
    return this.jiraService.getConnectionStatus(user.userId);
  }

  @Post('disconnect')
  @ApiOperation({
    summary: 'Disconnect Jira for the current user',
    description:
      'Removes stored Jira tokens for the authenticated user. Does not unlink project keys; use PATCH /projects/:id to clear jiraProjectKey per project.',
  })
  @ApiOkResponse({
    description: 'Jira disconnected successfully.',
    schema: { example: { success: true } },
  })
  @UseGuards(JwtAuthGuard)
  async disconnect(@CurrentUser() user: CurrentUserType): Promise<{ success: true }> {
    await this.jiraService.disconnect(user.userId);
    return { success: true };
  }

  @Get('available-projects')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'List Jira projects available to the current user',
    description:
      'Calls Jira Cloud `GET /rest/api/3/project/search` using the **authenticated user’s** OAuth token and linked site (cloudId). ' +
      'Use this after `GET /integrations/jira/connect` so Scrum Masters can pick a project by name instead of typing the key manually. ' +
      'Pass the selected `key` to `POST /integrations/jira/link/:projectId`. ' +
      'Only returns projects the user can browse in Jira.',
  })
  @ApiOkResponse({
    description: 'Paginated list of Jira projects on the connected site.',
    type: JiraAvailableProjectsResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Jira is not connected for this user, or Jira API returned an error.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  async listAvailableProjects(
    @CurrentUser() user: CurrentUserType,
    @Query() query: JiraAvailableProjectsQueryDto,
  ): Promise<JiraAvailableProjectsResponseDto> {
    try {
      return await this.jiraService.listAvailableProjects(user.userId, {
        query: query.query,
        maxResults: query.maxResults,
        startAt: query.startAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list Jira projects';
      if (message.includes('Jira not connected')) {
        throw new AppException(
          ErrorCode.VALIDATION_ERROR,
          'Connect Jira first via GET /integrations/jira/connect',
          400,
        );
      }
      throw new AppException(ErrorCode.VALIDATION_ERROR, message, 400);
    }
  }

  @Post('link/:projectId')
  @ApiOperation({
    summary: 'Link a Jira project to a Seam project',
    description:
      'Stores the Jira project **key** (e.g. PROJ) on the Seam project. When tasks are approved, they are synced to this Jira project. ' +
      'Only the project owner can link. The owner must have Jira connected (OAuth). ' +
      'Use `GET /integrations/jira/available-projects` to list keys after OAuth, or pass a key you already know.',
  })
  @ApiParam({
    name: 'projectId',
    description: 'Seam project UUID to link.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiOkResponse({
    description: 'Jira project key linked successfully.',
    schema: { example: { success: true } },
  })
  @ApiBadRequestResponse({
    description: 'Invalid request body (e.g. missing or empty projectKey).',
  })
  @ApiForbiddenResponse({ description: 'Only the project owner can link a Jira project.' })
  @ApiNotFoundResponse({ description: 'Project not found.' })
  @ApiBody({
    type: LinkJiraProjectDto,
    description: 'Jira project key from your Jira site (e.g. PROJ, MYTEAM).',
    examples: {
      default: {
        summary: 'Link project key PROJ',
        value: { projectKey: 'PROJ' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  async linkProject(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserType,
    @Body() body: LinkJiraProjectDto,
  ): Promise<{ success: true }> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
    }
    const isOwner = await this.projectRepo.isOwner(projectId, user.userId);
    if (!isOwner) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only project owner can link Jira project', 403);
    }
    await this.projectRepo.updateProject(projectId, {
      jiraProjectKey: body.projectKey.trim(),
    });
    return { success: true };
  }

  @Post('refresh-profile')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Refresh stored Jira accountId for the current user',
    description:
      'Calls Jira /myself and updates accountId, displayName, and emailAddress on your JiraAccount. ' +
      'Run after connecting Jira or when developer-activity attribution is missing.',
  })
  @ApiOkResponse({
    description: 'Profile refreshed from Jira.',
    schema: {
      example: {
        accountId: '557058:abc123',
        displayName: 'Jane Doe',
        emailAddress: 'jane@example.com',
      },
    },
  })
  async refreshProfile(@CurrentUser() user: CurrentUserType) {
    const profile = await this.jiraService.refreshMyselfProfile(user.userId);
    if (!profile) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Jira not connected or /myself failed', 400);
    }
    return profile;
  }

  @Get('projects/:projectId/issues/:issueKey/transitions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'List available Jira workflow transitions for an issue',
    description:
      'Returns transitions you can apply with POST .../transitions. Uses the **project owner** Jira token. ' +
      'Requires the Seam project to have jiraProjectKey set and the owner to have Jira connected.',
  })
  @ApiParam({ name: 'projectId', description: 'Seam project UUID.' })
  @ApiParam({
    name: 'issueKey',
    description: 'Jira issue key (e.g. PAY-42).',
    example: 'PAY-42',
  })
  @ApiOkResponse({
    description: 'Available transitions for the issue.',
    schema: {
      example: {
        transitions: [
          {
            id: '21',
            name: 'In Progress',
            to: { id: '3', name: 'In Progress', statusCategory: { name: 'In Progress' } },
          },
          {
            id: '31',
            name: 'Done',
            to: { id: '10001', name: 'Done', statusCategory: { name: 'Done' } },
          },
        ],
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Not a project member.' })
  @ApiNotFoundResponse({ description: 'Project or Jira issue not found.' })
  getIssueTransitions(
    @Param('projectId') projectId: string,
    @Param('issueKey') issueKey: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.jiraIssueService.getTransitions(projectId, issueKey, user.userId);
  }

  @Post('projects/:projectId/issues/:issueKey/transitions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Apply a Jira workflow transition to an issue',
    description:
      'Moves the issue to another status using Jira workflow transition id from GET .../transitions. ' +
      'No request body fields besides transitionId. Uses project owner token.',
  })
  @ApiParam({ name: 'projectId', description: 'Seam project UUID.' })
  @ApiParam({ name: 'issueKey', description: 'Jira issue key.', example: 'PAY-42' })
  @ApiBody({
    type: JiraTransitionIssueDto,
    examples: {
      inProgress: { summary: 'Start work', value: { transitionId: '21' } },
      done: { summary: 'Mark done', value: { transitionId: '31' } },
    },
  })
  @ApiOkResponse({
    description: 'Transition applied in Jira.',
    schema: {
      example: { issueKey: 'PAY-42', transitionId: '21', applied: true },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid transitionId or workflow does not allow this transition.',
  })
  transitionIssue(
    @Param('projectId') projectId: string,
    @Param('issueKey') issueKey: string,
    @Body() body: JiraTransitionIssueDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.jiraIssueService.transitionIssue(
      projectId,
      issueKey,
      body.transitionId,
      user.userId,
    );
  }
}
