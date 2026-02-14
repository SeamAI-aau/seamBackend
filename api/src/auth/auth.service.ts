import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { hash, compare } from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { AppLoggerService } from '../common/logger/app-logger.service';

@Injectable()
export class AuthService {
constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private logger: AppLoggerService,
) {}

async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
    where: { email: dto.email },
    });

    if (existingUser) {
    this.logger.warn('Registration failed: email exists', {
        email: dto.email,
    });

    throw new AppException(
        ErrorCode.EMAIL_ALREADY_EXISTS,
        'An account with this email already exists',
        409,
    );
    }

    const passwordHash = await hash(dto.password, 10);

    const user = await this.prisma.user.create({
    data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
    },
    });

    this.logger.log('User registered successfully', {
    userId: user.id,
    });

    return { message: 'User registered successfully' };
}

async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
    where: { email: dto.email },
    });

    if (!user) {
    throw new AppException(
        ErrorCode.INVALID_CREDENTIALS,
        'Email or password is incorrect',
        401,
    );
    }

    const isPasswordValid = await compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
    throw new AppException(
        ErrorCode.INVALID_CREDENTIALS,
        'Email or password is incorrect',
        401,
    );
    }

    const token = await this.jwtService.signAsync({
    sub: user.id,
    email: user.email,
    role: user.role,
    });

    this.logger.log('User logged in', {
    userId: user.id,
    });

    return {
    accessToken: token,
    };
}
}
