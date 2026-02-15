import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { JwtPayload } from './types/jwt.service.interface';
import { cookieTokenExtractor } from './jwt.cookie-extractor';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET environment variable must be defined');

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieTokenExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload || !payload.sub || !payload.email) {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Invalid JWT payload',
      });
    }
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
