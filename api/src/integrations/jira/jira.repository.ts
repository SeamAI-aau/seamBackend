import type { JiraAccount } from '@prisma/client';

export interface JiraAccountUpsertData {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  cloudId: string;
  siteUrl?: string | null;
  accountId?: string | null;
  displayName?: string | null;
  emailAddress?: string | null;
}

export interface IJiraRepository {
  findAccountByUserId(userId: string): Promise<JiraAccount | null>;

  updateTokens(
    userId: string,
    accessToken: string,
    refreshToken: string,
    expiresAt: Date,
  ): Promise<JiraAccount>;

  upsertAccount(userId: string, data: JiraAccountUpsertData): Promise<JiraAccount>;

  deleteByUserId(userId: string): Promise<void>;
}
