import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Query,
  UseGuards,
  Res,
  Inject,
} from '@nestjs/common';
import type{ Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserType } from '../../auth/types/current-user.type';
import { JiraService } from './jira.service';
import { LinkJiraProjectDto } from './dto/link-jira-project.dto';
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
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Integrations - Jira')
@ApiBearerAuth('access-token')
@Controller('integrations/jira')
@UseGuards(JwtAuthGuard)
export class JiraController {
  constructor(
    private readonly jiraService: JiraService,
    private readonly config: ConfigService,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: IProjectRepository,
  ) {}

  @Get('connect')
  @ApiOperation({
    summary: 'Start Jira OAuth flow',
    description: 'Redirects the browser to Atlassian\'s OAuth consent page. The user signs in and authorizes the app; Atlassian then redirects to your callback URL with a code.',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirect to Atlassian OAuth authorization URL.',
  })
  connect(@CurrentUser() user: CurrentUserType, @Res() res: Response): void {
    const url = this.jiraService.getAuthorizationUrl(user.userId);
    res.redirect(url);
  }

  @Get('callback')
  @ApiOperation({
    summary: 'OAuth callback (used by Atlassian redirect)',
    description: 'Exchanges the authorization code for access and refresh tokens, stores them for the user, then redirects to your frontend (e.g. /oauth-success). Do not call this manually; Atlassian redirects here after the user authorizes.',
  })
  @ApiQuery({ name: 'code', description: 'Authorization code from Atlassian (query param).', required: true })
  @ApiQuery({ name: 'state', description: 'State passed to connect (your user id).', required: true })
  @ApiResponse({ status: 302, description: 'Redirect to JIRA_OAUTH_SUCCESS_REDIRECT_URL or http://localhost:5173/oauth-success.' })
  @ApiBadRequestResponse({ description: 'Invalid or missing code; OAuth exchange failed.' })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.jiraService.handleCallback(code ?? '', state ?? '');
    const redirectUrl =
      this.config.get<string>('JIRA_OAUTH_SUCCESS_REDIRECT_URL') ??
      'http://localhost:5173/oauth-success';
    res.redirect(redirectUrl);
  }

  @Get('status')
  @ApiOperation({
    summary: 'Check if current user has Jira connected',
    description: 'Returns whether the authenticated user has completed Jira OAuth and has stored tokens.',
  })
  @ApiOkResponse({
    description: 'Connection status for the current user.',
    schema: {
      example: { connected: true },
      properties: { connected: { type: 'boolean', description: 'True if Jira is connected for this user.' } },
    },
  })
  async getStatus(
    @CurrentUser() user: CurrentUserType,
  ): Promise<{ connected: boolean }> {
    return this.jiraService.getConnectionStatus(user.userId);
  }

  @Post('disconnect')
  @ApiOperation({
    summary: 'Disconnect Jira for the current user',
    description: 'Removes stored Jira tokens for the authenticated user. Does not unlink project keys; use PATCH /projects/:id to clear jiraProjectKey per project.',
  })
  @ApiOkResponse({
    description: 'Jira disconnected successfully.',
    schema: { example: { success: true } },
  })
  async disconnect(@CurrentUser() user: CurrentUserType): Promise<{ success: true }> {
    await this.jiraService.disconnect(user.userId);
    return { success: true };
  }

  @Post('link/:projectId')
  @ApiOperation({
    summary: 'Link a Jira project to a Seam project',
    description: 'Stores the Jira project key on the Seam project. When tasks are approved, they are synced to this Jira project. Only the project owner can link. The project owner must have Jira connected (OAuth) for sync to work.',
  })
  @ApiParam({ name: 'projectId', description: 'Seam project UUID to link.', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiOkResponse({
    description: 'Jira project key linked successfully.',
    schema: { example: { success: true } },
  })
  @ApiBadRequestResponse({ description: 'Invalid request body (e.g. missing or empty projectKey).' })
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
}
