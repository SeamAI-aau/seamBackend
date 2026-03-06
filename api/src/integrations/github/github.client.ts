import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import type { GitHubPullRequest } from './types/github-api.types';
import { GITHUB_API_BASE } from './constants/github.constants';

/**
 * Thin client for GitHub REST API.
 * Caller is responsible for providing a valid access token.
 */
export class GithubApiClient {
  private readonly api: AxiosInstance;

  constructor(accessToken: string) {
    this.api = axios.create({
      baseURL: GITHUB_API_BASE,
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  async getPullRequests(owner: string, repo: string): Promise<GitHubPullRequest[]> {
    const url = `/repos/${owner}/${repo}/pulls`;
    const response: AxiosResponse<GitHubPullRequest[]> = await this.api.get(url, {
      params: { state: 'all', per_page: 100 },
    });
    return response.data;
  }
}
