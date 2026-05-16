import { User, Role } from '@prisma/client';
export type CreateUserInput = {
  name: string;
  email: string;
  passwordHash?: string | null;
  googleId?: string;
  emailVerifiedAt?: Date;
  avatarUrl?: string;
  role?: Role;
};

export interface IAuthRepository {
  findByEmail(email: string): Promise<User | null>;
  findByGoogleId(googleId: string): Promise<User | null>;
  create(data: CreateUserInput): Promise<User>;
  updateGoogleLink(
    userId: string,
    data: {
      googleId: string;
      emailVerifiedAt?: Date;
      name?: string;
      avatarUrl?: string;
    },
  ): Promise<User>;

  createRefreshToken(data: { userId: string; token: string; expiresAt: Date }): Promise<void>;

  findRefreshToken(token: string): Promise<{
    userId: string;
    expiresAt: Date;
    token: string;
  } | null>;

  findRefreshTokensByUserId(userId: string): Promise<
    {
      userId: string;
      expiresAt: Date;
      token: string;
    }[]
  >;

  deleteRefreshToken(token: string): Promise<void>;

  deleteAllUserRefreshTokens(userId: string): Promise<void>;
}
