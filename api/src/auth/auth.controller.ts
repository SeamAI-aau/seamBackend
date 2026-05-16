import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  Res,
  Req,
  BadRequestException,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { AuthMailService } from './auth-mail.service';
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

/** Shared cookie options: cross-origin dashboard needs `sameSite: 'none'` + `secure` in production. */
const cookieBaseOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    path: '/',
    sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
  };
};

function setAuthCookies(
  res: Response,
  tokens: {
    accessToken: string;
    refreshToken: string;
    accessExpiresMs: number;
    refreshExpiresMs: number;
  },
): void {
  const base = cookieBaseOptions();
  res.cookie('accessToken', tokens.accessToken, { ...base, maxAge: tokens.accessExpiresMs });
  res.cookie('refreshToken', tokens.refreshToken, { ...base, maxAge: tokens.refreshExpiresMs });
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authMail: AuthMailService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiCreatedResponse({
    description: 'User registered successfully.',
    schema: {
      example: {
        message: 'User registered successfully',
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
          role: 'SCRUM_MASTER',
        },
      },
      developer: {
        summary: 'Developer registration (role defaults to DEVELOPER)',
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
    const result = await this.authService.register(dto);
    setAuthCookies(res, result);
    const { accessToken, refreshToken, accessExpiresMs, refreshExpiresMs, ...body } = result;
    return body;
  }

  @Post('login')
  @ApiOperation({ summary: 'Log in and receive JWT + cookies' })
  @ApiOkResponse({
    description:
      'Login succeeded. Access and refresh tokens are set as HTTP-only cookies; response body contains a message.',
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
      'Tokens refreshed. New access and refresh tokens are set as HTTP-only cookies; body contains a message.',
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

  @Get('verify-email')
  @ApiOperation({
    summary: 'Verify email from link (redirects to dashboard)',
    description:
      'Validates the token from the verification email and redirects to the frontend dashboard.',
  })
  async verifyEmail(@Query('token') token: string | undefined, @Res() res: Response) {
    const { redirectPath } = await this.authService.verifyEmail(token ?? '');
    const base = this.authMail.getFrontendBaseUrl();
    const url = new URL(`${base}${redirectPath}`);
    url.searchParams.set('emailVerified', '1');
    res.redirect(url.toString());
  }

  @Post('resend-verification')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Resend email verification link' })
  async resendVerification(@CurrentUser() user: CurrentUserType) {
    return this.authService.resendVerificationEmail(user.userId);
  }

  @Post('forgot-password')
  @UseGuards(new AuthThrottleGuard(5, 60_000))
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiBody({ type: ForgotPasswordDto })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @UseGuards(new AuthThrottleGuard(8, 60_000))
  @ApiOperation({ summary: 'Reset password using token from email' })
  @ApiBody({ type: ResetPasswordDto })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Change password for the current user' })
  @ApiBody({ type: ChangePasswordDto })
  async changePassword(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.changePassword(user.userId, dto);
    const clearOpts = cookieBaseOptions();
    res.clearCookie('accessToken', clearOpts);
    res.clearCookie('refreshToken', clearOpts);
    return result;
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
  async logout(@CurrentUser() user: CurrentUserType, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(user.userId);
    const clearOpts = cookieBaseOptions();
    res.clearCookie('accessToken', clearOpts);
    res.clearCookie('refreshToken', clearOpts);

    return { message: 'Logged out successfully' };
  }
}
