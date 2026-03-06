import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import type{ Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserType } from '../../auth/types/current-user.type';
import { JiraService } from './jira.service';

@Controller('integrations/jira')
@UseGuards(JwtAuthGuard)
export class JiraController {
  constructor(
    private readonly jiraService: JiraService,
    private readonly config: ConfigService,
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
}
