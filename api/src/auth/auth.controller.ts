// auth/auth.controller.ts
import { Body, Controller, Post, UseGuards, Res, Req, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import type { Request } from 'express';
import { AuthService } from './auth.service';
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

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
  //temporarily changed by liya
  // @Post('login')
  // @ApiOperation({ summary: 'Log in and receive JWT + cookies' })
  // @ApiOkResponse({
  //   description:
  //     'Login succeeded. Access and refresh tokens are set as HTTP-only cookies; response body contains a human message.',
  //   schema: {
  //     example: { message: 'Logged in successfully' },
  //   },
  //   headers: {
  //     'set-cookie': {
  //       description:
  //         'HTTP-only cookies set for `accessToken` and `refreshToken`. May be returned multiple times (one per cookie).',
  //       schema: { type: 'string' },
  //     },
  //   },
  // })
  // @ApiBadRequestResponse({
  //   description: 'Validation error (e.g. invalid email format).',
  //   schema: {
  //     example: {
  //       statusCode: 400,
  //       message: ['email must be an email'],
  //       error: 'Bad Request',
  //     },
  //   },
  // })
  // @ApiUnauthorizedResponse({
  //   description: 'Invalid email or password.',
  //   schema: {
  //     example: {
  //       code: ErrorCode.INVALID_CREDENTIALS,
  //       message: 'Invalid email or password.',
  //       details: {
  //         hint: 'Check that your email and password are correct.',
  //       },
  //     },
  //   },
  // })
  // @ApiBody({
  //   type: LoginDto,
  //   examples: {
  //     default: {
  //       summary: 'Login example',
  //       value: {
  //         email: 'scrum.master@example.com',
  //         password: 'StrongP@ssw0rd',
  //       },
  //     },
  //   },
  // })
  // async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
  //   const { accessToken, refreshToken } = await this.authService.login(dto);

  //   // Set cookies
  //   res.cookie('accessToken', accessToken, {
  //     httpOnly: true,
  //     secure: process.env.NODE_ENV === 'production',
  //     maxAge: 15 * 60 * 1000,
  //   });

  //   res.cookie('refreshToken', refreshToken, {
  //     httpOnly: true,
  //     secure: process.env.NODE_ENV === 'production',
  //     maxAge: 7 * 24 * 60 * 60 * 1000,
  //   });

  //   return { message: 'Logged in successfully' };
  // }

  // @Post('refresh')
  // @ApiOperation({ summary: 'Refresh access and refresh tokens using refresh token' })
  // @ApiCookieAuth('access-cookie')
  // @ApiOkResponse({
  //   description:
  //     'Tokens refreshed. New access and refresh tokens are set as HTTP-only cookies; body contains a message.',
  //   schema: {
  //     example: { message: 'Tokens refreshed' },
  //   },
  //   headers: {
  //     'set-cookie': {
  //       description:
  //         'HTTP-only cookies updated for `accessToken` and `refreshToken`. May be returned multiple times (one per cookie).',
  //       schema: { type: 'string' },
  //     },
  //   },
  // })
  // @ApiBadRequestResponse({
  //   description: 'Missing refresh token (no cookie or body value).',
  //   schema: {
  //     example: {
  //       code: ErrorCode.VALIDATION_ERROR,
  //       message: 'Refresh token is required',
  //       details: {
  //         field: 'refreshToken',
  //         sources: ['body', 'cookie'],
  //       },
  //     },
  //   },
  // })
  // @ApiUnauthorizedResponse({
  //   description: 'Refresh token is invalid, expired, or has already been used.',
  //   schema: {
  //     example: {
  //       code: ErrorCode.UNAUTHORIZED,
  //       message:
  //         'The provided refresh token is invalid, expired, or has already been used. Please log in again.',
  //       details: {
  //         reason: 'verification_failed',
  //       },
  //     },
  //   },
  // })
  // async refresh(
  //   @Body('refreshToken') oldToken: string,
  //   @Req() req: Request,
  //   @Res({ passthrough: true }) res: Response,
  // ) {
  //   const token = oldToken ?? req.cookies?.refreshToken;
  //   if (!token) {
  //     throw new BadRequestException({
  //       code: ErrorCode.VALIDATION_ERROR,
  //       message: 'Refresh token is required',
  //       details: {
  //         field: 'refreshToken',
  //         sources: ['body', 'cookie'],
  //       },
  //     });
  //   }
  //   const { accessToken, refreshToken } = await this.authService.refreshToken(token);

  //   // Update cookies
  //   res.cookie('accessToken', accessToken, {
  //     httpOnly: true,
  //     secure: process.env.NODE_ENV === 'production',
  //     maxAge: 15 * 60 * 1000,
  //   });

  //   res.cookie('refreshToken', refreshToken, {
  //     httpOnly: true,
  //     secure: process.env.NODE_ENV === 'production',
  //     maxAge: 7 * 24 * 60 * 60 * 1000,
  //   });

  //   return { message: 'Tokens refreshed' };
  // }

  @Post('login')
  @ApiOperation({ summary: 'Log in and receive JWT + cookies' })
  @ApiOkResponse({
    description: 'Login succeeded. Access and refresh tokens are set as HTTP-only cookies.',
    schema: { example: { message: 'Logged in successfully' } },
  })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = await this.authService.login(dto);

    const isProduction = process.env.NODE_ENV === 'production';

    // Set accessToken cookie
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: true, // ← Force true (Render uses HTTPS)
      sameSite: 'none', // ← Force 'none' for cross-origin
      maxAge: 15 * 60 * 1000,
      path: '/', // important
    });

    // Set refreshToken cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true, // ← Force true
      sameSite: 'none', // ← Force 'none'
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return { message: 'Logged in successfully' };
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access and refresh tokens using refresh token' })
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
        details: { field: 'refreshToken', sources: ['body', 'cookie'] },
      });
    }

    const { accessToken, refreshToken } = await this.authService.refreshToken(token);

    const isProduction = process.env.NODE_ENV === 'production';

    // Update accessToken cookie
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: true, // ← Force true (Render uses HTTPS)
      sameSite: 'none', // ← Force 'none' for cross-origin
      maxAge: 15 * 60 * 1000,
      path: '/',
    });

    // Update refreshToken cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true, // ← Force true
      sameSite: 'none', // ← Force 'none'
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

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
    const clearOpts = {
      path: '/',
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
    };
    res.clearCookie('accessToken', clearOpts);
    res.clearCookie('refreshToken', clearOpts);

    return { message: 'Logged out successfully' };
  }
}
