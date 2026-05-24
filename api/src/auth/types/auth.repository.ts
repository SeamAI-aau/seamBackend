import { User, Role } from '@prisma/client';
import type { AuthTokenPurpose } from '../constants/auth-token.constants';

export type CreateUserInput = {
  name: string;
  email: string;
  passwordHash: string;
  role?: Role;
};

export type AuthTokenCandidate = {
  id: string;
  userId: string;
  tokenHash: string;
};

export type PostAuthRouteContext = {
  role: Role;
  projectId: string | null;
};

export interface IAuthRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(userId: string): Promise<User | null>;
  create(data: CreateUserInput): Promise<User>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  markEmailVerified(userId: string): Promise<void>;

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

  deleteAuthTokensByUserAndType(userId: string, type: AuthTokenPurpose): Promise<void>;
  createAuthToken(data: {
    userId: string;
    tokenHash: string;
    type: AuthTokenPurpose;
    expiresAt: Date;
  }): Promise<void>;
  findAuthTokensByUserAndType(
    userId: string,
    type: AuthTokenPurpose,
  ): Promise<{ id: string; tokenHash: string; expiresAt: Date }[]>;
  findValidAuthTokensByType(type: AuthTokenPurpose): Promise<AuthTokenCandidate[]>;
  deleteAuthTokenById(id: string): Promise<void>;
  findPostAuthRouteContext(userId: string): Promise<PostAuthRouteContext | null>;
}
