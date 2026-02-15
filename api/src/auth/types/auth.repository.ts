import { User, Role } from '@prisma/client';
export type CreateUserInput = {
  name: string;
  email: string;
  passwordHash: string;
  role?: Role;
};

export interface IAuthRepository {
  findByEmail(email: string): Promise<User | null>;
  create(data: CreateUserInput): Promise<User>;

  createRefreshToken(data: {
    userId: string;
    token: string;
    expiresAt: Date;
  }): Promise<void>;

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
