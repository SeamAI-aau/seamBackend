import {
  Injectable,
  Inject,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { hash, compare } from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import type { IAuthRepository } from './types/auth.repository';
import type { IJwtService, JwtPayload } from './types/jwt.service.interface';
import { AUTH_REPOSITORY, JWT_SERVICE } from './auth.tokens';
import { ErrorCode } from '../common/errors/error-codes';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { StringValue } from 'ms';

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly userRepo: IAuthRepository,
    @Inject(JWT_SERVICE) private readonly jwtService: IJwtService,
    private readonly configService: ConfigService,
    private readonly logger: Logger,
  ) {}

  /** REGISTER */
  async register(dto: RegisterDto) {
    const existing = await this.userRepo.findByEmail(dto.email);
    if (existing) {
      this.logger.warn('Registration failed: email exists', { email: dto.email });
      throw new ConflictException({
        code: ErrorCode.EMAIL_ALREADY_EXISTS,
        message:
          'A user with this email already exists. Please log in instead or use a different email address.',
        details: {
          field: 'email',
        },
      });
    }

    const saltRounds = parseInt(this.configService.get<string>('BCRYPT_SALT_ROUNDS') ?? '10', 10);

    const passwordHash = await hash(dto.password, saltRounds);
    const createData: Omit<RegisterDto, 'password'> = {
      email: dto.email,
      name: dto.name,
      ...(dto.role !== undefined ? { role: dto.role } : {}),
    };

    const user = await this.userRepo.create({ ...createData, passwordHash });

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
        details: {
          hint: 'Check that your email and password are correct.',
        },
      });
    }

    this.logger.log({ email, userId: user.id, step: 'login.password_ok' }, 'Login: password valid');

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
        details: {
          reason: 'verification_failed',
        },
      });
    }
    const tokens = await this.getValidRefreshToken(payload.sub, oldToken);
    if (!tokens) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message:
          'The provided refresh token is invalid, expired, or has already been used. Please log in again.',
        details: {
          reason: 'not_found_or_expired',
        },
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

  private logLoginFailure(
    step: string,
    email: string,
    err: unknown,
    extra?: Record<string, unknown>,
  ): void {
    const error = err instanceof Error ? err : new Error(String(err));
    this.logger.error(
      {
        step,
        email,
        ...extra,
        err: error,
        errName: error.name,
        errMessage: error.message,
        errStack: error.stack,
      },
      `Login failed at step: ${step}`,
    );
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

  /** PRIVATE: parse duration strings like '15m', '7d', '2h' into milliseconds */
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
