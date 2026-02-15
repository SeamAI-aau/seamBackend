// auth/auth.controller.ts
import { Body, Controller, Post, Get, UseGuards, Res, Req, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { RolesGuard } from './guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserType } from './types/current-user.type';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = await this.authService.login(dto);

    // Set cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 15 * 60 * 1000, 
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, 
    });

    return { message: 'Logged in successfully' };
  }

  @Post('refresh')
  async refresh(
    @Body('refreshToken') oldToken: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = oldToken ?? req.cookies?.refreshToken;
    if (!token) {
      throw new BadRequestException({
        message: 'Refresh token is required',
      });
    }
    const { accessToken, refreshToken } = await this.authService.refreshToken(token);

    // Update cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return { message: 'Tokens refreshed' };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: CurrentUserType,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(user.userId);
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: CurrentUserType) {
    return user;
  }

  @Get('admin-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SCRUM_MASTER)
  adminOnly() {
    return { message: 'You are a Scrum Master' };
  }
}
