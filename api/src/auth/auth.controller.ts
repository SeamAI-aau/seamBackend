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
import { GoogleAuthService } from './google-auth.service';
import type { GoogleOAuthIntent } from './types/google-oauth.types';
import { Role } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
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
  googleConnect(
    @Query('intent') intent: GoogleOAuthIntent | undefined,
    @Query('role') role: string | undefined,
    @Res() res: Response,
  ): void {
    const resolvedIntent: GoogleOAuthIntent = intent === 'signup' ? 'signup' : 'login';
    const resolvedRole =
      role === Role.DEVELOPER
        ? Role.DEVELOPER
        : role === Role.SCRUM_MASTER
          ? Role.SCRUM_MASTER
          : undefined;

    const url = this.googleAuthService.getAuthorizationUrl(resolvedIntent, resolvedRole);
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
      const redirectUrl = this.buildGoogleErrorRedirect(error);
      res.redirect(redirectUrl);
      return;
    }

    const { accessToken, refreshToken, accessExpiresMs, refreshExpiresMs } =
      await this.googleAuthService.authenticateCallback(code ?? '', state ?? '');

    const base = cookieBaseOptions();
    res.cookie('accessToken', accessToken, { ...base, maxAge: accessExpiresMs });
    res.cookie('refreshToken', refreshToken, { ...base, maxAge: refreshExpiresMs });

    const redirectUrl =
      this.config.get<string>('GOOGLE_OAUTH_SUCCESS_REDIRECT_URL') ??
      'http://localhost:8080/auth/google/success';

    res.redirect(redirectUrl);
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
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
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
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken, accessExpiresMs, refreshExpiresMs } =
      await this.authService.login(dto);

    const base = cookieBaseOptions();
    res.cookie('accessToken', accessToken, { ...base, maxAge: accessExpiresMs });
    res.cookie('refreshToken', refreshToken, { ...base, maxAge: refreshExpiresMs });

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

    const { accessToken, refreshToken, accessExpiresMs, refreshExpiresMs } =
      await this.authService.refreshToken(token);

    const base = cookieBaseOptions();
    res.cookie('accessToken', accessToken, { ...base, maxAge: accessExpiresMs });
    res.cookie('refreshToken', refreshToken, { ...base, maxAge: refreshExpiresMs });

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
  async logout(@CurrentUser() user: CurrentUserType, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(user.userId);
    const clearOpts = cookieBaseOptions();
    res.clearCookie('accessToken', clearOpts);
    res.clearCookie('refreshToken', clearOpts);

    return { message: 'Logged out successfully' };
  }
}
