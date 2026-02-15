import { Injectable, Inject, UnauthorizedException, ConflictException } from '@nestjs/common';
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
        message: 'Email already exists',
      });
    }

    const saltRounds = parseInt(this.configService.get<string>('BCRYPT_SALT_ROUNDS') ?? '10', 10);

    const passwordHash = await hash(dto.password, saltRounds);
    const user = await this.userRepo.create({ ...dto, passwordHash });

    this.logger.log('User registered successfully', { userId: user.id });
    return { message: 'User registered successfully' };
  }

  /** LOGIN */
  async login(dto: LoginDto) {
    const user = await this.userRepo.findByEmail(dto.email);
    if (!user) {
      this.logger.warn('Login failed: user not found', { email: dto.email });
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      });
    }

    const valid = await compare(dto.password, user.passwordHash);
    if (!valid) {
      this.logger.warn('Login failed: invalid password', { email: dto.email });
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      });
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return this.issueTokens(user.id, payload);
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
        message: 'Invalid refresh token',
      });
    }
    const tokens = await this.getValidRefreshToken(payload.sub, oldToken);
    if (!tokens) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Invalid refresh token',
      });
    }

    await this.userRepo.deleteRefreshToken(tokens.token);

    const { exp, iat, nbf, ...cleanPayload } = payload as JwtPayload & {
      exp?: number;
      iat?: number;
      nbf?: number;
    };
    this.logger.log('Refresh token validated, issuing new tokens', {
      userId: payload.sub,
      exp,
      iat,
      nbf,
    });

    return this.issueTokens(tokens.userId, cleanPayload);
  }

  /** LOGOUT */
  async logout(userId: string) {
    await this.userRepo.deleteAllUserRefreshTokens(userId);
    this.logger.log('User logged out, all refresh tokens revoked', { userId });
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

  private async issueTokens(userId: string, payload: JwtPayload) {
    const accessExpiresIn =
      this.configService.get<StringValue>('JWT_ACCESS_TOKEN_EXPIRES_IN') ?? '15m';
    const refreshExpiresIn =
      this.configService.get<StringValue>('JWT_REFRESH_TOKEN_EXPIRES_IN') ?? '7d';

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

  /** PRIVATE: parse duration strings like '15m', '7d', '2h' into milliseconds */
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
