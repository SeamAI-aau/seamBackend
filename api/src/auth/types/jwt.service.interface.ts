import { JwtSignOptions } from '@nestjs/jwt';
import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

export interface IJwtService {
  sign(payload: JwtPayload, options?: JwtSignOptions): Promise<string>;
  verify<T extends object = JwtPayload>(token: string): Promise<T>;
}
