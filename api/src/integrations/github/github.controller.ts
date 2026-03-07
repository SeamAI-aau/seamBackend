import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Res,
  Inject,
} from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type{ Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserType } from '../../auth/types/current-user.type';
import { GithubService } from './github.service';
import { GithubSyncService } from './github-sync.service';
import { LinkRepoDto } from './dto/link-repo.dto';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { IProjectRepository } from '../../project/types/project.repository';
import { PROJECT_REPOSITORY } from '../../project/types/project.tokens';

@Controller('integrations/github')
@UseGuards(JwtAuthGuard)
export class GithubController {
  constructor(
    private readonly githubService: GithubService,
    private readonly githubSyncService: GithubSyncService,
    private readonly config: ConfigService,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: IProjectRepository,
  ) {}

  @Get('connect')
  connect(@CurrentUser() user: CurrentUserType, @Res() res: Response): void {
    const url = this.githubService.getAuthorizationUrl(user.userId);
    res.redirect(url);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    await this.githubService.handleCallback(code ?? '', state ?? '');
    const redirectUrl =
      this.config.get<string>('GITHUB_OAUTH_SUCCESS_REDIRECT_URL') ??
      'http://localhost:5173/oauth-success';
    res.redirect(redirectUrl);
  }

  @Get('status')
  async getStatus(@CurrentUser() user: CurrentUserType): Promise<{ connected: boolean }> {
    return this.githubService.getConnectionStatus(user.userId);
  }

  @Post('disconnect')
  async disconnect(@CurrentUser() user: CurrentUserType): Promise<{ success: true }> {
    await this.githubService.disconnect(user.userId);
    return { success: true };
  }

  @Post('link/:projectId')
  async linkRepo(
    @Param('projectId') projectId: string,
    @Body() body: LinkRepoDto,
    @CurrentUser() user: CurrentUserType,
  ): Promise<{ success: true }> {
    await this.ensureProjectAccess(projectId, user.userId, true);
    await this.githubSyncService.linkRepo(projectId, body.repoUrl, user.userId);
    return { success: true };
  }

  @Post('sync/:projectId')
  async syncPullRequests(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserType,
  ): Promise<{ synced: number }> {
    await this.ensureProjectAccess(projectId, user.userId, false);
    return this.githubSyncService.syncPullRequests(projectId);
  }

  @Get('prs/:projectId')
  async getPullRequests(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserType,
    @Query() query: PaginationQueryDto,
  ) {
    await this.ensureProjectAccess(projectId, user.userId, false);
    return this.githubSyncService.getPullRequests(
      projectId,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get('blockers/:projectId')
  async getBlockers(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserType,
    @Query() query: PaginationQueryDto,
  ) {
    await this.ensureProjectAccess(projectId, user.userId, false);
    return this.githubSyncService.getBlockers(
      projectId,
      query.page ?? 1,
      query.limit ?? 50,
    );
  }

  private async ensureProjectAccess(
    projectId: string,
    userId: string,
    ownerOnly: boolean,
  ): Promise<void> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
    }
    const isOwner = await this.projectRepo.isOwner(projectId, userId);
    const isMember = await this.projectRepo.isMember(projectId, userId);
    if (ownerOnly && !isOwner) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only project owner can perform this action', 403);
    }
    if (!isOwner && !isMember) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Access denied', 403);
    }
  }
}
