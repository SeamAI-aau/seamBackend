import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { SKIP_EMAIL_VERIFICATION_KEY } from '../../common/decorators/skip-email-verification.decorator';
import { ErrorCode } from '../../common/errors/error-codes';
import type { CurrentUserType } from '../types/current-user.type';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  handleRequest<TUser = CurrentUserType>(
    err: unknown,
    user: TUser | false,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException('Unauthorized');
    }

    const skipVerification = this.reflector.getAllAndOverride<boolean>(
      SKIP_EMAIL_VERIFICATION_KEY,
      [context.getHandler(), context.getClass()],
    );

    const currentUser = user as CurrentUserType & { emailVerified?: boolean };
    if (!skipVerification && currentUser.emailVerified === false) {
      throw new ForbiddenException({
        code: ErrorCode.EMAIL_NOT_VERIFIED,
        message: 'Please verify your email before using this feature',
      });
    }

    return user;
  }
}
