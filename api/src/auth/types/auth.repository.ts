import { User } from '@prisma/client';
import { RegisterDto } from '../dto/register.dto';

export interface IAuthRepository {
  findByEmail(email: string): Promise<User | null>;
  create(data: RegisterDto & { passwordHash: string }): Promise<User>;
}
