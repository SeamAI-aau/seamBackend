import { Controller, Get, Post, Param, Body, Query, UseGuards, Res, Inject } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserType } from '../../auth/types/current-user.type';
import { GithubService } from './github.service';
import { GithubSyncService } from './github-sync.service';
import { GithubWebhookService } from './github-webhook.service';
import { GithubWebhookSetupDto } from './dto/github-webhook-setup.dto';
import { LinkRepoDto } from './dto/link-repo.dto';
import { GitHubAvailableReposQueryDto } from './dto/github-available-repos-query.dto';
import { GitHubAvailableReposResponseDto } from './dto/github-available-repo-response.dto';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { IProjectRepository } from '../../project/types/project.repository';
import { PROJECT_REPOSITORY } from '../../project/types/project.tokens';
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

@ApiTags('Integrations - GitHub')
@ApiBearerAuth('access-token')
@Controller('integrations/github')
export class GithubController {
  constructor(
    private readonly githubService: GithubService,
    private readonly githubSyncService: GithubSyncService,
    private readonly githubWebhookService: GithubWebhookService,
    private readonly config: ConfigService,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: IProjectRepository,
  ) {}

  @Get('connect')
  @ApiOperation({
    summary: 'Start GitHub OAuth flow',
    description:
      "Redirects the browser to GitHub's OAuth consent page. The user signs in and authorizes the app; GitHub then redirects to your callback URL with a code.",
  })
  @ApiResponse({
    status: 302,
    description: 'Redirect to GitHub OAuth authorization URL.',
  })
  @UseGuards(JwtAuthGuard)
  connect(@CurrentUser() user: CurrentUserType, @Res() res: Response): void {
    const url = this.githubService.getAuthorizationUrl(user.userId);
    res.redirect(url);
  }

  @Get('callback')
  @ApiOperation({
    summary: 'OAuth callback (used by GitHub redirect)',
    description:
      "Exchanges the authorization code for access and refresh tokens, stores them for the user, and updates the user's GitHub username. Then redirects to your frontend (e.g. /oauth-success). Do not call this manually; GitHub redirects here after the user authorizes.",
  })
  @ApiQuery({
    name: 'code',
    description: 'Authorization code from GitHub (query param).',
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
      'Redirect to GITHUB_OAUTH_SUCCESS_REDIRECT_URL or http://localhost:8080/oauth-success?provider=github.',
  })
  @ApiBadRequestResponse({ description: 'Invalid or missing code; OAuth exchange failed.' })
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    await this.githubService.handleCallback(code ?? '', state ?? '');
    const redirectUrl =
      this.config.get<string>('GITHUB_OAUTH_SUCCESS_REDIRECT_URL') ??
      'http://localhost:8080/oauth-success?provider=github';
    res.redirect(redirectUrl);
  }

  @Get('status')
  @ApiOperation({
    summary: 'Check if current user has GitHub connected',
    description:
      'Returns whether the authenticated user has completed GitHub OAuth and has stored tokens.',
  })
  @ApiOkResponse({
    description: 'Connection status for the current user.',
    schema: {
      example: { connected: true },
      properties: {
        connected: { type: 'boolean', description: 'True if GitHub is connected for this user.' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  async getStatus(@CurrentUser() user: CurrentUserType): Promise<{ connected: boolean }> {
    return this.githubService.getConnectionStatus(user.userId);
  }

  @Get('webhook-setup')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'GitHub repository webhook setup (dashboard)',
    description:
      'Returns the payload URL and event settings to configure in GitHub → Repository → Settings → Webhooks. ' +
      'Does not return `GITHUB_WEBHOOK_SECRET`; that must match on both GitHub and the API host.',
  })
  @ApiOkResponse({ type: GithubWebhookSetupDto })
  getWebhookSetup(): GithubWebhookSetupDto {
    return this.githubWebhookService.getWebhookSetup();
  }

  @Get('available-repositories')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'List GitHub repositories available to the current user',
    description:
      'Calls GitHub `GET /user/repos` using the **authenticated user’s** OAuth token. ' +
      'Use this after `GET /integrations/github/connect` so Scrum Masters can pick a repository by name instead of pasting a URL. ' +
      'Pass the selected `htmlUrl` to `POST /integrations/github/link/:projectId`.',
  })
  @ApiOkResponse({
    description: 'Paginated list of repositories the user can access.',
    type: GitHubAvailableReposResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'GitHub is not connected for this user, or GitHub API returned an error.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  async listAvailableRepositories(
    @CurrentUser() user: CurrentUserType,
    @Query() query: GitHubAvailableReposQueryDto,
  ): Promise<GitHubAvailableReposResponseDto> {
    try {
      return await this.githubService.listAvailableRepositories(user.userId, {
        query: query.query,
        perPage: query.perPage,
        page: query.page,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list GitHub repositories';
      if (message.includes('GitHub not connected')) {
        throw new AppException(
          ErrorCode.VALIDATION_ERROR,
          'Connect GitHub first via GET /integrations/github/connect',
          400,
        );
      }
      throw new AppException(ErrorCode.VALIDATION_ERROR, message, 400);
    }
  }

  @Post('disconnect')
  @ApiOperation({
    summary: 'Disconnect GitHub for the current user',
    description:
      'Removes stored GitHub tokens for the authenticated user. Does not unlink repos from projects; use PATCH /projects/:id to clear githubRepoUrl per project.',
  })
  @ApiOkResponse({
    description: 'GitHub disconnected successfully.',
    schema: { example: { success: true } },
  })
  @UseGuards(JwtAuthGuard)
  async disconnect(@CurrentUser() user: CurrentUserType): Promise<{ success: true }> {
    await this.githubService.disconnect(user.userId);
    return { success: true };
  }

  @Post('link/:projectId')
  @ApiOperation({
    summary: 'Link a GitHub repository to a Seam project',
    description:
      'Stores the repository URL on the project. The project owner must have GitHub connected (OAuth). After linking, use POST sync/:projectId to fetch pull requests. Only the project owner can link.',
  })
  @ApiParam({
    name: 'projectId',
    description: 'Seam project UUID to link.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiOkResponse({
    description: 'Repository linked successfully.',
    schema: { example: { success: true } },
  })
  @ApiBadRequestResponse({
    description: 'Invalid request body (e.g. not a valid GitHub repo URL).',
  })
  @ApiForbiddenResponse({ description: 'Only the project owner can link a repository.' })
  @ApiNotFoundResponse({ description: 'Project not found.' })
  @ApiBody({
    type: LinkRepoDto,
    description: 'Full GitHub repository URL (https://github.com/owner/repo).',
    examples: {
      default: {
        summary: 'Link a repository',
        value: { repoUrl: 'https://github.com/acme/payments-api' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
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
  @ApiOperation({
    summary: 'Sync pull requests from GitHub',
    description:
      'Fetches open/closed pull requests from the linked GitHub repo and upserts them. Also runs blocker detection (stale PRs, missing reviewers, etc.). Requires the project to have a repo linked and the project owner to have GitHub connected.',
  })
  @ApiParam({
    name: 'projectId',
    description: 'Seam project UUID.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiOkResponse({
    description: 'Number of PRs synced.',
    schema: {
      example: { synced: 12 },
      properties: {
        synced: { type: 'number', description: 'Number of pull requests fetched and stored.' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'User does not have access to the project.' })
  @ApiNotFoundResponse({ description: 'Project not found or project has no GitHub repo linked.' })
  @UseGuards(JwtAuthGuard)
  async syncPullRequests(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserType,
  ): Promise<{ synced: number }> {
    await this.ensureProjectAccess(projectId, user.userId, false);
    return this.githubSyncService.syncPullRequestsViaQueue(projectId);
  }

  @Get('prs/:projectId')
  @ApiOperation({
    summary: 'List pull requests for a project',
    description:
      "Returns paginated pull requests that have been synced for the project's linked GitHub repository.",
  })
  @ApiParam({
    name: 'projectId',
    description: 'Seam project UUID.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiOkResponse({
    description: 'Paginated list of pull requests.',
    schema: {
      example: {
        items: [
          {
            id: 'pr-uuid',
            githubId: 123,
            title: 'Add retry logic for payments',
            author: 'dev-user',
            state: 'OPEN',
            draft: false,
            url: 'https://github.com/acme/repo/pull/123',
            projectId: 'proj-uuid',
            prCreatedAt: '2026-03-01T10:00:00.000Z',
            createdAt: '2026-03-06T10:00:00.000Z',
            updatedAt: '2026-03-06T10:00:00.000Z',
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
  @ApiNotFoundResponse({ description: 'Project not found.' })
  @UseGuards(JwtAuthGuard)
  async getPullRequests(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserType,
    @Query() query: PaginationQueryDto,
  ) {
    await this.ensureProjectAccess(projectId, user.userId, false);
    return this.githubSyncService.getPullRequests(projectId, query.page ?? 1, query.limit ?? 20);
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
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Only project owner can perform this action',
        403,
      );
    }
    if (!isOwner && !isMember) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Access denied', 403);
    }
  }
}
