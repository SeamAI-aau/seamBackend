// auth/auth.service.ts
import { Injectable, Inject, UnauthorizedException, ConflictException } from '@nestjs/common';
import type { IAuthRepository } from './types/auth.repository';
import { AUTH_REPOSITORY } from './auth.tokens';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { hash, compare } from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { Logger } from 'nestjs-pino';

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly userRepo: IAuthRepository,
    private readonly jwtService: JwtService,
    private readonly logger: Logger,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.userRepo.findByEmail(dto.email);
    if (existingUser) {
      this.logger.warn('Registration failed: email exists', { email: dto.email });
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await hash(dto.password, 10);
    const user = await this.userRepo.create({ ...dto, passwordHash });

    this.logger.log('User registered successfully', { userId: user.id });
    return { message: 'User registered successfully' };
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Email or password is incorrect');

    const isPasswordValid = await compare(dto.password, user.passwordHash);
    if (!isPasswordValid) throw new UnauthorizedException('Email or password is incorrect');

    const token = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    this.logger.log('User logged in', { userId: user.id });
    return { accessToken: token };
  }
}
