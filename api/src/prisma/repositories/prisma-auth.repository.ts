import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { AuthTokenPurpose } from '../../auth/constants/auth-token.constants';
import { IAuthRepository, CreateUserInput } from '../../auth/types/auth.repository';
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

  findByGoogleId(googleId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { googleId } });
  }

  create(data: CreateUserInput) {
    return this.prisma.user.create({
      data: {
        email: data.email.trim().toLowerCase(),
        name: data.name,
        passwordHash: data.passwordHash ?? null,
        ...(data.googleId ? { googleId: data.googleId } : {}),
        ...(data.emailVerifiedAt ? { emailVerifiedAt: data.emailVerifiedAt } : {}),
        ...(data.avatarUrl ? { avatarUrl: data.avatarUrl } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
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

  updateGoogleLink(
    userId: string,
    data: {
      googleId: string;
      emailVerifiedAt?: Date;
      name?: string;
      avatarUrl?: string;
    },
  ): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        googleId: data.googleId,
        ...(data.emailVerifiedAt ? { emailVerifiedAt: data.emailVerifiedAt } : {}),
        ...(data.name ? { name: data.name } : {}),
        ...(data.avatarUrl ? { avatarUrl: data.avatarUrl } : {}),
      },
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
}
