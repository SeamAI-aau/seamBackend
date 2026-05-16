import { Injectable, Inject, UnauthorizedException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import axios, { type AxiosResponse } from 'axios';
import { randomBytes } from 'crypto';
import { Role, type User } from '@prisma/client';
import type { IAuthRepository } from './types/auth.repository';
import type { IJwtService } from './types/jwt.service.interface';
import { AUTH_REPOSITORY, JWT_SERVICE } from './auth.tokens';
import { ErrorCode } from '../common/errors/error-codes';
import {
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  GOOGLE_SCOPES,
} from './constants/google.constants';
import type {
  GoogleOAuthIntent,
  GoogleOAuthStatePayload,
  GoogleTokenResponse,
  GoogleUserInfo,
} from './types/google-oauth.types';
import type { JwtPayload } from './types/jwt.service.interface';
import { hash } from 'bcryptjs';
import { StringValue } from 'ms';

@Injectable()
export class GoogleAuthService {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly userRepo: IAuthRepository,
    @Inject(JWT_SERVICE) private readonly jwtService: IJwtService,
    private readonly config: ConfigService,
    private readonly logger: Logger,
  ) {}

  getAuthorizationUrl(intent: GoogleOAuthIntent, role?: Role): string {
    this.assertGoogleConfigured();

    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID')!;
    const redirectUri = this.config.get<string>('GOOGLE_REDIRECT_URI')!;
    const state = this.signState({ intent, role });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      state,
      access_type: 'online',
      prompt: 'select_account',
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  async authenticateCallback(
    code: string,
    state: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    accessExpiresMs: number;
    refreshExpiresMs: number;
    isNewUser: boolean;
  }> {
    this.assertGoogleConfigured();

    if (!code?.trim()) {
      throw new UnauthorizedException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Google authorization code is missing.',
      });
    }

    const statePayload = this.verifyState(state);
    const profile = await this.exchangeCodeAndFetchProfile(code.trim());
    const { user, isNewUser } = await this.findOrCreateUser(profile, statePayload);

    const tokens = await this.issueTokens(user.id, {
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    this.logger.log('Google OAuth sign-in succeeded', {
      userId: user.id,
      isNewUser,
      intent: statePayload.intent,
    });

    return { ...tokens, isNewUser };
  }

  private async findOrCreateUser(
    profile: GoogleUserInfo,
    state: GoogleOAuthStatePayload,
  ): Promise<{ user: User; isNewUser: boolean }> {
    const googleId = profile.sub;
    const email = profile.email?.trim().toLowerCase();

    if (!email) {
      throw new UnauthorizedException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Google did not return an email address for this account.',
      });
    }

    if (profile.email_verified === false) {
      throw new UnauthorizedException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Your Google email must be verified before signing in.',
      });
    }

    const displayName =
      profile.name?.trim() ||
      [profile.given_name, profile.family_name].filter(Boolean).join(' ').trim() ||
      email.split('@')[0];

    let user = await this.userRepo.findByGoogleId(googleId);
    if (user) {
      return { user, isNewUser: false };
    }

    const byEmail = await this.userRepo.findByEmail(email);
    if (byEmail) {
      if (byEmail.googleId && byEmail.googleId !== googleId) {
        throw new ConflictException({
          code: ErrorCode.EMAIL_ALREADY_EXISTS,
          message:
            'This email is already linked to a different Google account. Sign in with your original method.',
        });
      }

      user = await this.userRepo.updateGoogleLink(byEmail.id, {
        googleId,
        emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
        name: byEmail.name || displayName,
        avatarUrl: profile.picture ?? byEmail.avatarUrl ?? undefined,
      });

      return { user, isNewUser: false };
    }

    if (state.intent === 'login') {
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'No account found for this Google email. Please sign up first.',
      });
    }

    const role =
      state.role === Role.DEVELOPER || state.role === Role.SCRUM_MASTER
        ? state.role
        : Role.SCRUM_MASTER;

    user = await this.userRepo.create({
      email,
      name: displayName,
      passwordHash: null,
      googleId,
      emailVerifiedAt: new Date(),
      role,
      avatarUrl: profile.picture ?? undefined,
    });

    return { user, isNewUser: true };
  }

  private async exchangeCodeAndFetchProfile(code: string): Promise<GoogleUserInfo> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID')!;
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET')!;
    const redirectUri = this.config.get<string>('GOOGLE_REDIRECT_URI')!;

    const tokenBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const tokenResponse: AxiosResponse<GoogleTokenResponse> = await axios.post(
      GOOGLE_TOKEN_URL,
      tokenBody.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const accessToken = tokenResponse.data?.access_token;
    if (!accessToken) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Google sign-in failed. Please try again.',
      });
    }

    const userResponse: AxiosResponse<GoogleUserInfo> = await axios.get(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userResponse.data?.sub) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Could not read your Google profile. Please try again.',
      });
    }

    return userResponse.data;
  }

  private signState(input: { intent: GoogleOAuthIntent; role?: Role }): string {
    const payload: GoogleOAuthStatePayload = {
      purpose: 'google_auth',
      intent: input.intent,
      ...(input.role ? { role: input.role } : {}),
      nonce: randomBytes(16).toString('hex'),
    };
    return this.jwtService.sign(payload as unknown as JwtPayload, { expiresIn: '10m' });
  }

  private verifyState(state: string): GoogleOAuthStatePayload {
    if (!state?.trim()) {
      throw new UnauthorizedException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid Google sign-in state. Please try again.',
      });
    }

    try {
      const payload = this.jwtService.verify<GoogleOAuthStatePayload>(state);
      if (payload.purpose !== 'google_auth') {
        throw new Error('invalid purpose');
      }
      return payload;
    } catch {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Google sign-in expired or was invalid. Please try again.',
      });
    }
  }

  private assertGoogleConfigured(): void {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.config.get<string>('GOOGLE_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new UnauthorizedException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Google sign-in is not configured on this server.',
      });
    }
  }

  private async issueTokens(userId: string, payload: JwtPayload) {
    const accessExpiresIn =
      this.config.get<StringValue>('JWT_ACCESS_TOKEN_EXPIRES_IN') ?? '15m';
    const refreshExpiresIn =
      this.config.get<StringValue>('JWT_REFRESH_TOKEN_EXPIRES_IN') ?? '7d';

    const accessExpiresMs = this.parseDuration(accessExpiresIn);
    const refreshExpiresMs = this.parseDuration(refreshExpiresIn);

    const accessToken = await this.jwtService.sign(payload, { expiresIn: accessExpiresIn });
    const refreshToken = await this.jwtService.sign(payload, { expiresIn: refreshExpiresIn });

    const tokenHash = await hash(refreshToken, 10);
    const expiresAt = new Date(Date.now() + refreshExpiresMs);

    await this.userRepo.createRefreshToken({
      userId,
      token: tokenHash,
      expiresAt,
    });

    return { accessToken, refreshToken, accessExpiresMs, refreshExpiresMs };
  }

  private parseDuration(duration: string): number {
    const unit = duration.slice(-1);
    const value = parseInt(duration.slice(0, -1), 10);

    switch (unit) {
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'm':
        return value * 60 * 1000;
      case 's':
        return value * 1000;
      default:
        throw new Error(`Invalid duration format: ${duration}`);
    }
  }
}
