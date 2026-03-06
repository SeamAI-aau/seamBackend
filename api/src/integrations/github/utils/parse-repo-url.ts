import type { RepoIdentifier } from '../types/github-api.types';

const GITHUB_URL_REGEX = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i;

/**
 * Parse owner and repo name from a GitHub URL.
 */
export function parseGitHubRepoUrl(repoUrl: string): RepoIdentifier {
  const trimmed = repoUrl.trim();
  const match = trimmed.match(GITHUB_URL_REGEX);
  if (!match) {
    throw new Error(
      `Invalid GitHub repo URL: ${repoUrl}. Expected format: https://github.com/owner/repo`,
    );
  }
  return { owner: match[1], repo: match[2] };
}
