import { Injectable, Inject } from '@nestjs/common';
import axios, { type AxiosResponse } from 'axios';
import { ConfigService } from '@nestjs/config';
import { encrypt, decrypt } from '../../common/utils/encryption.util';
import type { IGithubRepository } from './github.repository';
import { GITHUB_REPOSITORY } from './github.tokens';
import type { GitHubTokenResponse } from './types/github-api.types';
import { GITHUB_AUTH_URL, GITHUB_TOKEN_URL, GITHUB_SCOPES } from './constants/github.constants';

@Injectable()
export class GithubService {
  constructor(
    private readonly config: ConfigService,
    @Inject(GITHUB_REPOSITORY)
    private readonly githubRepo: IGithubRepository,
  ) {}

  getAuthorizationUrl(userId: string): string {
    const clientId = this.config.get<string>('GITHUB_CLIENT_ID');
    const redirectUri = this.config.get<string>('GITHUB_REDIRECT_URI');
    const params = new URLSearchParams({
      client_id: clientId ?? '',
      redirect_uri: redirectUri ?? '',
      scope: GITHUB_SCOPES.join(' '),
      state: userId,
    });
    return `${GITHUB_AUTH_URL}?${params.toString()}`;
  }

  async handleCallback(code: string, state: string): Promise<void> {
    const userId = state;
    const clientId = this.config.get<string>('GITHUB_CLIENT_ID');
    const clientSecret = this.config.get<string>('GITHUB_CLIENT_SECRET');
    const redirectUri = this.config.get<string>('GITHUB_REDIRECT_URI');

    const response: AxiosResponse<GitHubTokenResponse> = await axios.post(
      GITHUB_TOKEN_URL,
      {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      },
      {
        headers: { Accept: 'application/json' },
      },
    );

    const { access_token, refresh_token } = response.data;
    if (!access_token) {
      throw new Error('GitHub OAuth: no access token in response');
    }

    const secret = this.config.get<string>('TOKEN_ENCRYPTION_SECRET');
    await this.githubRepo.upsertAccount(userId, {
      accessToken: encrypt(access_token, secret || 'the secret'),
      refreshToken: refresh_token ? encrypt(refresh_token, secret || 'the secret') : undefined,
    });
  }

  async getConnectionStatus(userId: string): Promise<{ connected: boolean }> {
    const account = await this.githubRepo.findAccountByUserId(userId);
    return { connected: !!account };
  }

  async disconnect(userId: string): Promise<void> {
    await this.githubRepo.deleteAccountByUserId(userId);
  }

  /**
   * Returns decrypted access token for GitHub API calls.
   */
  async getValidAccessToken(userId: string): Promise<string> {
    const account = await this.githubRepo.findAccountByUserId(userId);
    if (!account) throw new Error('GitHub not connected');
    const secret = this.config.get<string>('TOKEN_ENCRYPTION_SECRET');
    return decrypt(account.accessToken, secret || 'the secret');
  }
}
