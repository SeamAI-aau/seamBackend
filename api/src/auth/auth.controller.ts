import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UseGuards, Get } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { RolesGuard } from './guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type{ CurrentUserType } from './types/current-user.type';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
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
