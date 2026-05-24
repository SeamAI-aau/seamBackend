import { Injectable } from '@nestjs/common';
import type { AuthTokenPurpose } from '../../auth/constants/auth-token.constants';
import {
  IAuthRepository,
  CreateUserInput,
  type AuthTokenCandidate,
  type PostAuthRouteContext,
} from '../../auth/types/auth.repository';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PrismaAuthRepository implements IAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    const normalized = email.trim().toLowerCase();
    return this.prisma.user.findFirst({
      where: { email: { equals: normalized, mode: 'insensitive' } },
    });
  }

  findById(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  create(data: CreateUserInput) {
    return this.prisma.user.create({
      data: {
        ...data,
        email: data.email.trim().toLowerCase(),
      },
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
  }

  async createRefreshToken(data: { userId: string; token: string; expiresAt: Date }) {
    await this.prisma.refreshToken.create({ data });
  }

  async findRefreshToken(token: string) {
    return this.prisma.refreshToken.findFirst({
      where: { token },
      select: { userId: true, expiresAt: true, token: true },
    });
  }

  async findRefreshTokensByUserId(userId: string) {
    return this.prisma.refreshToken.findMany({
      where: { userId },
      select: { userId: true, expiresAt: true, token: true },
    });
  }

  async deleteRefreshToken(token: string) {
    await this.prisma.refreshToken.deleteMany({ where: { token } });
  }

  async deleteAllUserRefreshTokens(userId: string) {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
  }

  async deleteAuthTokensByUserAndType(userId: string, type: AuthTokenPurpose) {
    await this.prisma.userAuthToken.deleteMany({ where: { userId, type } });
  }

  async createAuthToken(data: {
    userId: string;
    tokenHash: string;
    type: AuthTokenPurpose;
    expiresAt: Date;
  }) {
    await this.prisma.userAuthToken.create({ data });
  }

  findAuthTokensByUserAndType(userId: string, type: AuthTokenPurpose) {
    return this.prisma.userAuthToken.findMany({
      where: { userId, type },
      select: { id: true, tokenHash: true, expiresAt: true },
    });
  }

  async deleteAuthTokenById(id: string) {
    await this.prisma.userAuthToken.delete({ where: { id } });
  }

  findValidAuthTokensByType(type: AuthTokenPurpose): Promise<AuthTokenCandidate[]> {
    return this.prisma.userAuthToken.findMany({
      where: { type, expiresAt: { gt: new Date() } },
      select: { id: true, userId: true, tokenHash: true },
    });
  }

  async findPostAuthRouteContext(userId: string): Promise<PostAuthRouteContext | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        ownedProjects: { select: { id: true }, take: 1, orderBy: { createdAt: 'asc' } },
        projectMembers: {
          where: { status: 'ACTIVE' },
          select: { project: { select: { id: true } } },
          take: 1,
        },
      },
    });

    if (!user) {
      return null;
    }

    const projectId =
      user.ownedProjects[0]?.id ?? user.projectMembers[0]?.project?.id ?? null;

    return { role: user.role, projectId };
  }
}
