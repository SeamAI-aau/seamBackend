import { Injectable } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { IJwtService, JwtPayload } from './types/jwt.service.interface';

@Injectable()
export class JwtServiceAdapter implements IJwtService {
  constructor(private readonly jwtService: JwtService) {}

  sign(
    payload: JwtPayload,
    options?: JwtSignOptions,
  ): Promise<string> {
    return this.jwtService.signAsync(payload, options);
  }

  verify<T extends object = JwtPayload>(token: string): Promise<T> {
    return this.jwtService.verifyAsync<T>(token);
  }
}
