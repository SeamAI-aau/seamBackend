import { Role } from '@prisma/client';

export interface CurrentUserType {
  userId: string;
  email: string;
  role: Role;
}
