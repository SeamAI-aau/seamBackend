// prisma/repositories/prisma-auth.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { IAuthRepository } from '../../auth/types/auth.repository';
import { User } from '@prisma/client';
import { RegisterDto } from '../../auth/dto/register.dto';

@Injectable()
export class PrismaAuthRepository implements IAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  create(data: RegisterDto & { passwordHash: string }): Promise<User> {
    return this.prisma.user.create({ data });
  }
}
