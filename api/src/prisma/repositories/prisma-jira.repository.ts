import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type {
  IJiraRepository,
  JiraAccountUpsertData,
} from '../../integrations/jira/jira.repository';

@Injectable()
export class PrismaJiraRepository implements IJiraRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAccountByUserId(userId: string) {
    return this.prisma.jiraAccount.findUnique({
      where: { userId },
    });
  }

  async updateTokens(userId: string, accessToken: string, refreshToken: string, expiresAt: Date) {
    return this.prisma.jiraAccount.update({
      where: { userId },
      data: {
        accessToken,
        refreshToken,
        expiresAt,
      },
    });
  }

  async upsertAccount(userId: string, data: JiraAccountUpsertData) {
    return this.prisma.jiraAccount.upsert({
      where: { userId },
      update: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        cloudId: data.cloudId,
        accountId: data.accountId ?? undefined,
        displayName: data.displayName ?? undefined,
        emailAddress: data.emailAddress ?? undefined,
      },
      create: {
        userId,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        cloudId: data.cloudId,
        accountId: data.accountId ?? undefined,
        displayName: data.displayName ?? undefined,
        emailAddress: data.emailAddress ?? undefined,
      },
    });
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.prisma.jiraAccount.deleteMany({
      where: { userId },
    });
  }
}
