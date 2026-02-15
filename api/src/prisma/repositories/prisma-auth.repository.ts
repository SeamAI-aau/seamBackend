import { Injectable } from '@nestjs/common';
import { IAuthRepository } from '../../auth/types/auth.repository';
import { PrismaService } from '../prisma.service';
import { User } from '@prisma/client';
import { CreateUserInput } from '../../auth/types/auth.repository';

@Injectable()
export class PrismaAuthRepository implements IAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  create(data: CreateUserInput): Promise<User> {
    return this.prisma.user.create({ data });
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
    await this.prisma.refreshToken.deleteMany({
      where: { token },
    });
  }

  async deleteAllUserRefreshTokens(userId: string) {
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }
}
