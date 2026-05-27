import {
  Injectable,
  Inject,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { hash, compare } from 'bcryptjs';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { Role } from '@prisma/client';
import {
  AUTH_TOKEN_TYPE,
  type AuthTokenPurpose,
} from './constants/auth-token.constants';
import type { IAuthRepository } from './types/auth.repository';
import type { IJwtService, JwtPayload } from './types/jwt.service.interface';
import { AUTH_REPOSITORY, JWT_SERVICE } from './auth.tokens';
import { ErrorCode } from '../common/errors/error-codes';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthMailService } from './auth-mail.service';
import {
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
} from './constants/auth-token.constants';
import { StringValue } from 'ms';

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly userRepo: IAuthRepository,
    @Inject(JWT_SERVICE) private readonly jwtService: IJwtService,
    private readonly configService: ConfigService,
    private readonly logger: Logger,
    private readonly authMail: AuthMailService,
  ) {}

  /** REGISTER — creates user, issues tokens (auto-login), sends verification email */
  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      this.logger.warn('Registration failed: email exists', { email });
      throw new ConflictException({
        code: ErrorCode.EMAIL_ALREADY_EXISTS,
        message:
          'A user with this email already exists. Please log in instead or use a different email address.',
        details: { field: 'email' },
      });
    }

    const saltRounds = parseInt(this.configService.get<string>('BCRYPT_SALT_ROUNDS') ?? '10', 10);
    const passwordHash = await hash(dto.password, saltRounds);
    const role =
      dto.registrationIntent === 'scrum_master' ? Role.SCRUM_MASTER : Role.DEVELOPER;

    const user = await this.userRepo.create({
      email,
      name: dto.name,
      passwordHash,
      role,
    });
    await this.issueAndStoreEmailVerificationCode(user.id, user.email, user.name);

    this.logger.log('User registered successfully', { userId: user.id });

    const tokens = await this.issueTokens(user.id, {
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: false,
      },
      ...tokens,
    };
  }

  /** LOGIN */
  async login(dto: LoginDto) {
    const email = dto.email?.trim() ?? '';
    this.logger.log({ email, step: 'login.start' }, 'Login attempt started');

    let user;
    try {
      user = await this.userRepo.findByEmail(dto.email);
    } catch (err) {
      this.logLoginFailure('findByEmail', email, err);
      throw err;
    }

    if (!user) {
      this.logger.warn({ email, step: 'login.user_not_found' }, 'Login failed: user not found');
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid email or password.',
        details: {
          hint: 'Check that your email and password are correct.',
        },
      });
    }

    this.logger.log(
      {
        email,
        userId: user.id,
        role: user.role,
        hasPasswordHash: !!user.passwordHash,
        step: 'login.user_loaded',
      },
      'Login: user found',
    );

    if (!user.passwordHash) {
      this.logger.warn(
        { email, userId: user.id, step: 'login.no_password_hash' },
        'Login failed: account has no password (OAuth-only user)',
      );
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'This account cannot sign in with a password. Use your OAuth provider instead.',
        details: { reason: 'missing_password_hash' },
      });
    }

    let valid = false;
    try {
      valid = await compare(dto.password, user.passwordHash);
    } catch (err) {
      this.logLoginFailure('password_compare', email, err, { userId: user.id });
      throw err;
    }

    if (!valid) {
      this.logger.warn(
        { email, userId: user.id, step: 'login.invalid_password' },
        'Login failed: invalid password',
      );
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid email or password.',
        details: { hint: 'Check that your email and password are correct.' },
      });
    }

    this.logger.log({ email, userId: user.id, step: 'login.password_ok' }, 'Login: password valid');

    if (!user.emailVerifiedAt) {
      this.logger.warn(
        { email, userId: user.id, step: 'login.email_not_verified' },
        'Login blocked: email not verified',
      );
      await this.issueAndStoreEmailVerificationCode(user.id, user.email, user.name ?? '');
      throw new UnauthorizedException({
        code: ErrorCode.EMAIL_NOT_VERIFIED,
        message: 'Please verify your email before signing in. A new code has been sent.',
        details: { email: user.email, requiresVerification: true },
      });
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    try {
      const tokens = await this.issueTokens(user.id, payload, email);
      this.logger.log(
        { email, userId: user.id, step: 'login.success' },
        'Login completed; tokens issued',
      );
      return tokens;
    } catch (err) {
      this.logLoginFailure('issueTokens', email, err, { userId: user.id });
      throw err;
    }
  }

  /** REFRESH */
  async refreshToken(oldToken: string) {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verify<JwtPayload>(oldToken);
    } catch (error) {
      this.logger.warn('Refresh failed: invalid refresh token', { err: error });
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message:
          'The provided refresh token is invalid, expired, or has already been used. Please log in again.',
        details: { reason: 'verification_failed' },
      });
    }
    const tokens = await this.getValidRefreshToken(payload.sub, oldToken);
    if (!tokens) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message:
          'The provided refresh token is invalid, expired, or has already been used. Please log in again.',
        details: { reason: 'not_found_or_expired' },
      });
    }

    await this.userRepo.deleteRefreshToken(tokens.token);

    const cleanPayload: JwtPayload = {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
    };

    return this.issueTokens(tokens.userId, cleanPayload);
  }

  /** LOGOUT */
  async logout(userId: string) {
    await this.userRepo.deleteAllUserRefreshTokens(userId);
    this.logger.log('User logged out, all refresh tokens revoked', { userId });
  }

  /** Verify email via 6-digit code */
  async verifyEmailWithCode(email: string, code: string): Promise<{ message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.userRepo.findByEmail(normalizedEmail);
    if (!user) {
      throw new BadRequestException({
        code: ErrorCode.INVALID_AUTH_TOKEN,
        message: 'Invalid verification code.',
      });
    }

    if (user.emailVerifiedAt) {
      return { message: 'Email is already verified' };
    }

    const userId = await this.consumeAuthToken(code, AUTH_TOKEN_TYPE.EMAIL_VERIFICATION);
    if (!userId || userId !== user.id) {
      throw new BadRequestException({
        code: ErrorCode.INVALID_AUTH_TOKEN,
        message: 'Invalid or expired verification code. Please request a new one.',
      });
    }

    await this.userRepo.markEmailVerified(userId);
    this.logger.log('Email verified via code', { userId });
    return { message: 'Email verified successfully' };
  }

  /** Resend verification code for a given email (no auth required — used pre-login) */
  async resendVerificationCode(email: string): Promise<{ message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.userRepo.findByEmail(normalizedEmail);
    if (!user) {
      return { message: 'If an account exists, a verification code has been sent.' };
    }
    if (user.emailVerifiedAt) {
      return { message: 'Email is already verified' };
    }

    await this.issueAndStoreEmailVerificationCode(user.id, user.email, user.name ?? '');
    return { message: 'Verification code sent' };
  }

  /** Forgot password — always returns success message (no email enumeration) */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.userRepo.findByEmail(dto.email);
    if (user) {
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = await hash(rawToken, 10);
      await this.userRepo.deleteAuthTokensByUserAndType(user.id, AUTH_TOKEN_TYPE.PASSWORD_RESET);
      await this.userRepo.createAuthToken({
        userId: user.id,
        tokenHash,
        type: AUTH_TOKEN_TYPE.PASSWORD_RESET,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      });
      await this.authMail.sendPasswordReset(user.email, user.name, rawToken);
    }

    return {
      message:
        'If an account exists for that email, we sent password reset instructions.',
    };
  }

  /** Reset password with token from email */
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const userId = await this.consumeAuthToken(dto.token, AUTH_TOKEN_TYPE.PASSWORD_RESET);
    if (!userId) {
      throw new BadRequestException({
        code: ErrorCode.AUTH_TOKEN_EXPIRED,
        message: 'This reset link is invalid or has expired. Request a new one.',
      });
    }

    const saltRounds = parseInt(this.configService.get<string>('BCRYPT_SALT_ROUNDS') ?? '10', 10);
    const passwordHash = await hash(dto.newPassword, saltRounds);
    await this.userRepo.updatePassword(userId, passwordHash);
    await this.userRepo.deleteAllUserRefreshTokens(userId);

    // Mark email as verified when the password is reset via email link.
    // Resetting password via the email link proves ownership of the email,
    // so we should not require a separate email verification step afterwards.
    try {
      await this.userRepo.markEmailVerified(userId);
      this.logger.log('Email marked verified via password reset', { userId });
    } catch (err) {
      this.logger.warn('Failed to mark email verified after password reset', { userId, err });
    }

    return { message: 'Password updated successfully. You can sign in with your new password.' };
  }

  /** Change password while authenticated */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new UnauthorizedException({ code: ErrorCode.UNAUTHORIZED, message: 'Unauthorized' });
    }

    if (!user.passwordHash) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'This account uses OAuth sign-in and has no password to change.',
      });
    }

    const valid = await compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Current password is incorrect.',
      });
    }

    const saltRounds = parseInt(this.configService.get<string>('BCRYPT_SALT_ROUNDS') ?? '10', 10);
    const passwordHash = await hash(dto.newPassword, saltRounds);
    await this.userRepo.updatePassword(userId, passwordHash);
    await this.userRepo.deleteAllUserRefreshTokens(userId);

    return { message: 'Password changed successfully. Please sign in again on other devices.' };
  }

  private async issueAndStoreEmailVerificationCode(
    userId: string,
    email: string,
    name: string,
  ): Promise<void> {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await hash(code, 10);
    await this.userRepo.deleteAuthTokensByUserAndType(userId, AUTH_TOKEN_TYPE.EMAIL_VERIFICATION);
    await this.userRepo.createAuthToken({
      userId,
      tokenHash: codeHash,
      type: AUTH_TOKEN_TYPE.EMAIL_VERIFICATION,
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    });
    await this.authMail.sendEmailVerificationCode(email, name, code);
  }

  private async consumeAuthToken(rawToken: string, type: AuthTokenPurpose): Promise<string | null> {
    if (!rawToken?.trim()) return null;

    const candidates = await this.userRepo.findValidAuthTokensByType(type);

    for (const row of candidates) {
      const matches = await compare(rawToken, row.tokenHash);
      if (!matches) continue;
      await this.userRepo.deleteAuthTokenById(row.id);
      return row.userId;
    }

    return null;
  }

  /** Dashboard path after verification (matches frontend getPostAuthPath logic). */
  async resolveDashboardPath(userId: string): Promise<string> {
    const context = await this.userRepo.findPostAuthRouteContext(userId);

    if (!context) {
      return '/sign-in';
    }

    if (context.role === Role.DEVELOPER) {
      return '/projects';
    }

    if (context.projectId) {
      return `/projects/${context.projectId}/dashboard`;
    }

    return '/projects';
  }

  private async getValidRefreshToken(userId: string, token: string) {
    const all = await this.userRepo.findRefreshTokensByUserId(userId);
    if (!all.length) return null;

    const now = new Date();
    for (const stored of all) {
      const matches = await compare(token, stored.token);
      if (!matches) continue;

      if (stored.expiresAt <= now) {
        await this.userRepo.deleteRefreshToken(stored.token);
        return null;
      }

      return stored;
    }

    return null;
  }

  private logLoginFailure(
    step: string,
    email: string,
    err: unknown,
    extra?: Record<string, unknown>,
  ): void {
    this.logger.error(
      { email, step: `login.${step}_failed`, err, ...extra },
      `Login failed during ${step}`,
    );
  }

  private async issueTokens(userId: string, payload: JwtPayload, emailForLog?: string) {
    const logCtx = { userId, email: emailForLog, step: '' as string };

    const accessExpiresIn =
      this.configService.get<StringValue>('JWT_ACCESS_TOKEN_EXPIRES_IN') ?? '15m';
    const refreshExpiresIn =
      this.configService.get<StringValue>('JWT_REFRESH_TOKEN_EXPIRES_IN') ?? '7d';

    logCtx.step = 'issueTokens.parse_duration';
    this.logger.debug(
      { ...logCtx, accessExpiresIn, refreshExpiresIn },
      'Login: parsing JWT expiry durations',
    );

    let accessExpiresMs: number;
    let refreshExpiresMs: number;
    try {
      accessExpiresMs = this.parseDuration(accessExpiresIn);
      refreshExpiresMs = this.parseDuration(refreshExpiresIn);
    } catch (err) {
      this.logger.error(
        {
          ...logCtx,
          accessExpiresIn,
          refreshExpiresIn,
          err,
        },
        'Login: invalid JWT_ACCESS_TOKEN_EXPIRES_IN or JWT_REFRESH_TOKEN_EXPIRES_IN',
      );
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Server JWT expiry configuration is invalid',
        details: { accessExpiresIn, refreshExpiresIn },
      });
    }

    logCtx.step = 'issueTokens.sign_access';
    this.logger.debug(logCtx, 'Login: signing access token');
    const accessToken = await this.jwtService.sign(payload, { expiresIn: accessExpiresIn });

    logCtx.step = 'issueTokens.sign_refresh';
    this.logger.debug(logCtx, 'Login: signing refresh token');
    const refreshToken = await this.jwtService.sign(payload, { expiresIn: refreshExpiresIn });

    logCtx.step = 'issueTokens.hash_refresh';
    this.logger.debug(logCtx, 'Login: hashing refresh token for storage');
    const tokenHash = await hash(refreshToken, 10);
    const expiresAt = new Date(Date.now() + refreshExpiresMs);

    logCtx.step = 'issueTokens.persist_refresh';
    this.logger.debug({ ...logCtx, expiresAt: expiresAt.toISOString() }, 'Login: saving refresh token');
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

    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Invalid duration value in: ${duration}`);
    }

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
