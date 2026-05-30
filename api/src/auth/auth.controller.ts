import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Query,
  UseGuards,
  Res,
  Req,
  BadRequestException,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import type { GoogleOAuthIntent } from './types/google-oauth.types';
import { Role } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthThrottleGuard } from './guards/auth-throttle.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserType } from './types/current-user.type';
import { ErrorCode } from '../common/errors/error-codes';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiUnauthorizedResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiBody,
} from '@nestjs/swagger';
import { clearAuthCookies, setAuthCookies } from '../common/config/auth-cookie.config';
import { SkipEmailVerification } from '../common/decorators/skip-email-verification.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('google')
  @ApiOperation({
    summary: 'Start Google OAuth for sign-in or sign-up',
    description:
      'Redirects the browser to Google. Use `intent=login` or `intent=signup`. ' +
      'Optional `role=DEVELOPER` for invite-based developer registration.',
  })
  async googleConnect(
    @Query('intent') intent: GoogleOAuthIntent | undefined,
    @Query('role') role: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const resolvedIntent: GoogleOAuthIntent = intent === 'signup' ? 'signup' : 'login';
    const resolvedRole =
      role === Role.DEVELOPER
        ? Role.DEVELOPER
        : role === Role.SCRUM_MASTER
          ? Role.SCRUM_MASTER
          : undefined;

    const url = await this.googleAuthService.getAuthorizationUrl(resolvedIntent, resolvedRole);
    res.redirect(url);
  }

  @Get('google/callback')
  @ApiOperation({
    summary: 'Google OAuth callback',
    description:
      'Exchanges the authorization code, creates or links the user, sets auth cookies, and redirects to the frontend.',
  })
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (error) {
      res.redirect(this.buildGoogleErrorRedirect(error));
      return;
    }

    try {
      const { accessToken, refreshToken, accessExpiresMs, refreshExpiresMs, isNewUser } =
        await this.googleAuthService.authenticateCallback(code ?? '', state ?? '');

      setAuthCookies(res, {
        accessToken,
        refreshToken,
        accessExpiresMs,
        refreshExpiresMs,
      });

      const redirectUrl =
        this.config.get<string>('GOOGLE_OAUTH_SUCCESS_REDIRECT_URL') ??
        'http://localhost:8080/auth/google/success';

      const url = new URL(redirectUrl);
      if (isNewUser) {
        url.searchParams.set('new', '1');
      }

      res.redirect(url.toString());
    } catch {
      res.redirect(this.buildGoogleErrorRedirect('authentication_failed'));
    }
  }

  private buildGoogleErrorRedirect(error: string): string {
    const base =
      this.config.get<string>('GOOGLE_OAUTH_ERROR_REDIRECT_URL') ??
      this.config.get<string>('GOOGLE_OAUTH_SUCCESS_REDIRECT_URL') ??
      'http://localhost:8080/auth/google/success';

    const url = new URL(base);
    url.searchParams.set('error', error);
    return url.toString();
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiCreatedResponse({
    description:
      'User registered successfully. Access and refresh tokens are set as HTTP-only cookies.',
    schema: {
      example: {
        message: 'User registered successfully',
        user: {
          id: '…',
          email: 'scrum.master@example.com',
          name: 'Jane Doe',
          role: 'SCRUM_MASTER',
          emailVerified: false,
        },
      },
    },
    headers: {
      'set-cookie': {
        description: 'HTTP-only cookies for `accessToken` and `refreshToken`.',
        schema: { type: 'string' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Validation error (e.g. invalid email or too-short password).',
    schema: {
      example: {
        statusCode: 400,
        message: [
          'email must be an email',
          'password must be longer than or equal to 6 characters',
        ],
        error: 'Bad Request',
      },
    },
  })
  @ApiConflictResponse({
    description: 'Email already in use.',
    schema: {
      example: {
        code: ErrorCode.EMAIL_ALREADY_EXISTS,
        message:
          'A user with this email already exists. Please log in instead or use a different email address.',
        details: {
          field: 'email',
        },
      },
    },
  })
  @ApiBody({
    type: RegisterDto,
    examples: {
      scrumMaster: {
        summary: 'Scrum Master registration',
        value: {
          email: 'scrum.master@example.com',
          name: 'Jane Doe',
          password: 'StrongP@ssw0rd',
          registrationIntent: 'scrum_master',
        },
      },
      developer: {
        summary: 'Developer registration (default role)',
        value: {
          email: 'dev@example.com',
          name: 'John Dev',
          password: 'StrongP@ssw0rd',
        },
      },
    },
  })
  @UseGuards(new AuthThrottleGuard(8, 60_000))
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken, accessExpiresMs, refreshExpiresMs, user, message } =
      await this.authService.register(dto);
    setAuthCookies(res, { accessToken, refreshToken, accessExpiresMs, refreshExpiresMs });
    return { message, user };
  }

  @Post('login')
  @ApiOperation({ summary: 'Log in and receive JWT + cookies' })
  @ApiOkResponse({
    description:
      'Login succeeded. Access and refresh tokens are set as HTTP-only cookies.',
    schema: {
      example: { message: 'Logged in successfully' },
    },
    headers: {
      'set-cookie': {
        description:
          'HTTP-only cookies set for `accessToken` and `refreshToken`. May be returned multiple times (one per cookie).',
        schema: { type: 'string' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Validation error (e.g. invalid email format).',
    schema: {
      example: {
        statusCode: 400,
        message: ['email must be an email'],
        error: 'Bad Request',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid email or password.',
    schema: {
      example: {
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid email or password.',
        details: {
          hint: 'Check that your email and password are correct.',
        },
      },
    },
  })
  @ApiBody({
    type: LoginDto,
    examples: {
      default: {
        summary: 'Login example',
        value: {
          email: 'scrum.master@example.com',
          password: 'StrongP@ssw0rd',
        },
      },
    },
  })
  @UseGuards(new AuthThrottleGuard(12, 60_000))
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.login(dto);
    setAuthCookies(res, tokens);
    return { message: 'Logged in successfully' };
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access and refresh tokens using refresh token' })
  @ApiCookieAuth('access-cookie')
  @ApiOkResponse({
    description:
      'Tokens refreshed. New access and refresh tokens are set as HTTP-only cookies.',
    schema: {
      example: { message: 'Tokens refreshed' },
    },
    headers: {
      'set-cookie': {
        description:
          'HTTP-only cookies updated for `accessToken` and `refreshToken`. May be returned multiple times (one per cookie).',
        schema: { type: 'string' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Missing refresh token (no cookie or body value).',
    schema: {
      example: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Refresh token is required',
        details: {
          field: 'refreshToken',
          sources: ['body', 'cookie'],
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Refresh token is invalid, expired, or has already been used.',
    schema: {
      example: {
        code: ErrorCode.UNAUTHORIZED,
        message:
          'The provided refresh token is invalid, expired, or has already been used. Please log in again.',
        details: {
          reason: 'verification_failed',
        },
      },
    },
  })
  @UseGuards(new AuthThrottleGuard(20, 60_000))
  async refresh(
    @Body('refreshToken') oldToken: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = oldToken ?? req.cookies?.refreshToken;
    if (!token) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Refresh token is required',
        details: {
          field: 'refreshToken',
          sources: ['body', 'cookie'],
        },
      });
    }

    const tokens = await this.authService.refreshToken(token);
    setAuthCookies(res, tokens);
    return { message: 'Tokens refreshed' };
  }

  @Post('logout')
  @ApiOperation({ summary: 'Log out current user (clear JWT cookies)' })
  @ApiOkResponse({
    description: 'Logout succeeded; cookies cleared.',
    schema: { example: { message: 'Logged out successfully' } },
  })
  @ApiBearerAuth('access-token')
  @ApiCookieAuth('access-cookie')
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @SkipEmailVerification()
  async logout(@CurrentUser() user: CurrentUserType, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(user.userId);
    clearAuthCookies(res);
    return { message: 'Logged out successfully' };
  }

  @Post('clear-session')
  @ApiOperation({ summary: 'Clear auth cookies without requiring a valid access token' })
  @ApiOkResponse({
    description: 'Auth cookies cleared (used before sign-in to drop stale sessions).',
    schema: { example: { message: 'Session cleared' } },
  })
  clearSession(@Res({ passthrough: true }) res: Response) {
    clearAuthCookies(res);
    return { message: 'Session cleared' };
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'Verify email with a 6-digit code' })
  @UseGuards(new AuthThrottleGuard(10, 60_000))
  verifyEmail(@Body() body: { email: string; code: string }) {
    if (!body.email?.trim() || !body.code?.trim()) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Email and verification code are required',
      });
    }
    return this.authService.verifyEmailWithCode(body.email, body.code);
  }

  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend verification code to the given email' })
  @UseGuards(new AuthThrottleGuard(3, 60_000))
  resendVerification(@Body() body: { email: string }) {
    if (!body.email?.trim()) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Email is required',
      });
    }
    return this.authService.resendVerificationCode(body.email);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password reset email' })
  @UseGuards(new AuthThrottleGuard(5, 60_000))
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using token from email' })
  @UseGuards(new AuthThrottleGuard(8, 60_000))
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Change password while authenticated' })
  @ApiBearerAuth('access-token')
  @ApiCookieAuth('access-cookie')
  @UseGuards(JwtAuthGuard, new AuthThrottleGuard(8, 60_000))
  changePassword(@CurrentUser() user: CurrentUserType, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.userId, dto);
  }
}
