import { User } from '@prisma/client';

export interface IUserRepository {
  findById(userId: string): Promise<User | null>;

  findDevelopers(): Promise<User[]>;

  findProjectMembers(projectId: string): Promise<User[]>;
}
