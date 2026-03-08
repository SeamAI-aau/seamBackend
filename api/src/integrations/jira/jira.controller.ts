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

@Controller('integrations/jira')
@UseGuards(JwtAuthGuard)
export class JiraController {
  constructor(
    private readonly jiraService: JiraService,
    private readonly config: ConfigService,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: IProjectRepository,
  ) {}

  /**
   * Redirects the user to Atlassian OAuth consent page.
   */
  @Get('connect')
  connect(@CurrentUser() user: CurrentUserType, @Res() res: Response): void {
    const url = this.jiraService.getAuthorizationUrl(user.userId);
    res.redirect(url);
  }

  /**
   * OAuth callback: exchange code for tokens and redirect to frontend.
   */
  @Get('callback')
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

  /**
   * Returns whether the current user has Jira connected.
   */
  @Get('status')
  async getStatus(
    @CurrentUser() user: CurrentUserType,
  ): Promise<{ connected: boolean }> {
    return this.jiraService.getConnectionStatus(user.userId);
  }

  /**
   * Disconnect Jira for the current user.
   */
  @Post('disconnect')
  async disconnect(@CurrentUser() user: CurrentUserType): Promise<{ success: true }> {
    await this.jiraService.disconnect(user.userId);
    return { success: true };
  }

  /**
   * Link a Jira project (by key) to a Seam project. Owner only.
   */
  @Post('link/:projectId')
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
