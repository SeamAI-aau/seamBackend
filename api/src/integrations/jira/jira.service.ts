import { Injectable, Inject } from '@nestjs/common';
import axios, { type AxiosResponse } from 'axios';
import { ConfigService } from '@nestjs/config';
import { encrypt, decrypt } from '../../common/utils/encryption.util';
import type { IJiraRepository } from './jira.repository';
import { JIRA_REPOSITORY } from './jira.tokens';
import type { AtlassianTokenResponse, AtlassianResource } from './types/jira-api.types';
import type { JiraMyselfResponse } from './types/jira-myself.types';
import type {
  JiraAvailableProjectsResult,
  JiraProjectSearchResponse,
} from './types/jira-project.types';
import {
  JIRA_SCOPES,
  ATLASSIAN_AUTH_URL,
  ATLASSIAN_TOKEN_URL,
  ATLASSIAN_RESOURCES_URL,
  TOKEN_EXPIRY_BUFFER_MS,
} from './constants/jira.constants';

@Injectable()
export class JiraService {
  constructor(
    private readonly config: ConfigService,
    @Inject(JIRA_REPOSITORY)
    private readonly jiraRepo: IJiraRepository,
  ) {}

  getAuthorizationUrl(userId: string): string {
    const clientId = this.config.get<string>('JIRA_CLIENT_ID');
    const redirectUri = this.config.get<string>('JIRA_REDIRECT_URI');
    if (!clientId?.trim() || !redirectUri?.trim()) {
      throw new Error('Jira OAuth is not configured (JIRA_CLIENT_ID / JIRA_REDIRECT_URI)');
    }
    const scopes = JIRA_SCOPES.join(' ');

    const params = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: clientId,
      scope: scopes,
      redirect_uri: redirectUri,
      state: userId,
      response_type: 'code',
      prompt: 'consent',
    });

    return `${ATLASSIAN_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Handle OAuth callback: exchange code for tokens, fetch cloud ID, persist account.
   */
  async handleCallback(code: string, state: string): Promise<void> {
    const userId = state;
    const clientId = this.config.get<string>('JIRA_CLIENT_ID');
    const clientSecret = this.config.get<string>('JIRA_CLIENT_SECRET');
    const redirectUri = this.config.get<string>('JIRA_REDIRECT_URI');

    const tokenResponse: AxiosResponse<AtlassianTokenResponse> = await axios.post(
      ATLASSIAN_TOKEN_URL,
      {
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      },
      { headers: { 'Content-Type': 'application/json' } },
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    const resourcesResponse = await axios.get<AtlassianResource[]>(ATLASSIAN_RESOURCES_URL, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const cloudId = resourcesResponse.data[0]?.id;
    if (!cloudId) {
      throw new Error('No Jira cloud resource returned');
    }

    const secret = this.config.get<string>('TOKEN_ENCRYPTION_SECRET') || 'this is a secret';
    const encryptedAccess = encrypt(access_token, secret);
    await this.jiraRepo.upsertAccount(userId, {
      accessToken: encryptedAccess,
      refreshToken: encrypt(refresh_token, secret),
      expiresAt: new Date(Date.now() + expires_in * 1000),
      cloudId,
    });

    await this.refreshMyselfProfile(userId, access_token, cloudId);
  }

  /**
   * Fetches /myself and stores accountId + profile fields for activity attribution.
   */
  async refreshMyselfProfile(
    userId: string,
    accessToken?: string,
    cloudId?: string,
  ): Promise<JiraMyselfResponse | null> {
    let token = accessToken;
    let siteCloudId = cloudId;
    if (!token || !siteCloudId) {
      const valid = await this.getValidAccessToken(userId);
      token = valid.accessToken;
      siteCloudId = valid.cloudId;
    }

    try {
      const res = await axios.get<JiraMyselfResponse>(
        `https://api.atlassian.com/ex/jira/${siteCloudId}/rest/api/3/myself`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        },
      );
      const account = await this.jiraRepo.findAccountByUserId(userId);
      if (!account) return null;

      const secret = this.config.get<string>('TOKEN_ENCRYPTION_SECRET') || 'this is a secret';
      await this.jiraRepo.upsertAccount(userId, {
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        expiresAt: account.expiresAt,
        cloudId: account.cloudId,
        accountId: res.data.accountId,
        displayName: res.data.displayName ?? null,
        emailAddress: res.data.emailAddress ?? null,
      });
      return res.data;
    } catch {
      return null;
    }
  }

  getApiBaseUrl(cloudId: string): string {
    return `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3`;
  }

  /**
   * Lists Jira projects visible to the connected user (for linking to a Seam project).
   * Requires OAuth with read:jira-work. Uses the user's stored cloud site.
   */
  async listAvailableProjects(
    userId: string,
    options?: { query?: string; maxResults?: number; startAt?: number },
  ): Promise<JiraAvailableProjectsResult> {
    const { accessToken, cloudId } = await this.getValidAccessToken(userId);
    const maxResults = Math.min(Math.max(options?.maxResults ?? 50, 1), 100);
    const startAt = Math.max(options?.startAt ?? 0, 0);

    const params = new URLSearchParams({
      maxResults: String(maxResults),
      startAt: String(startAt),
      orderBy: 'name',
    });
    const trimmedQuery = options?.query?.trim();
    if (trimmedQuery) {
      params.set('query', trimmedQuery);
    }

    const res = await axios.get<JiraProjectSearchResponse>(
      `${this.getApiBaseUrl(cloudId)}/project/search?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      },
    );

    const items = (res.data.values ?? []).map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      projectTypeKey: p.projectTypeKey ?? null,
      avatarUrl: p.avatarUrls?.['24x24'] ?? p.avatarUrls?.['16x16'] ?? null,
    }));

    return {
      items,
      startAt: res.data.startAt ?? startAt,
      maxResults: res.data.maxResults ?? maxResults,
      total: res.data.total ?? items.length,
      isLast: res.data.isLast ?? true,
    };
  }

  /**
   * Returns whether the user has a Jira account linked.
   */
  async getConnectionStatus(userId: string): Promise<{ connected: boolean }> {
    const account = await this.jiraRepo.findAccountByUserId(userId);
    return { connected: !!account };
  }

  /**
   * Disconnect Jira for the user (removes stored tokens).
   */
  async disconnect(userId: string): Promise<void> {
    await this.jiraRepo.deleteByUserId(userId);
  }

  /**
   * Returns a valid access token for the user, refreshing if expired.
   * Used by sync and other Jira API callers.
   */
  async getValidAccessToken(userId: string): Promise<{
    accessToken: string;
    cloudId: string;
  }> {
    const account = await this.jiraRepo.findAccountByUserId(userId);
    if (!account) {
      throw new Error('Jira not connected');
    }

    const secret = this.config.get<string>('TOKEN_ENCRYPTION_SECRET') || 'this is a secret';
    const now = Date.now();
    const expiresAt = account.expiresAt.getTime();

    if (expiresAt - TOKEN_EXPIRY_BUFFER_MS > now) {
      return {
        accessToken: decrypt(account.accessToken, secret),
        cloudId: account.cloudId,
      };
    }

    const refreshed = await this.refreshTokens(userId, account.refreshToken, secret);
    return {
      accessToken: refreshed.accessToken,
      cloudId: account.cloudId,
    };
  }

  private async refreshTokens(
    userId: string,
    encryptedRefreshToken: string,
    secret: string,
  ): Promise<{ accessToken: string }> {
    const refreshToken = decrypt(encryptedRefreshToken, secret);
    const clientId = this.config.get<string>('JIRA_CLIENT_ID');
    const clientSecret = this.config.get<string>('JIRA_CLIENT_SECRET');

    const tokenResponse: AxiosResponse<AtlassianTokenResponse> = await axios.post(
      ATLASSIAN_TOKEN_URL,
      {
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      },
      { headers: { 'Content-Type': 'application/json' } },
    );

    const { access_token, refresh_token: newRefreshToken, expires_in } = tokenResponse.data;

    await this.jiraRepo.updateTokens(
      userId,
      encrypt(access_token, secret),
      encrypt(newRefreshToken, secret),
      new Date(Date.now() + expires_in * 1000),
    );

    return { accessToken: access_token };
  }
}
