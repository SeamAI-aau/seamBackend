import { User } from '@prisma/client';

export interface IUserRepository {
  findById(userId: string): Promise<User | null>;

  findByEmail(email: string): Promise<User | null>;

  findDevelopers(options?: { skip?: number; take?: number }): Promise<User[]>;

  countDevelopers(): Promise<number>;

  findProjectMembers(
    projectId: string,
    options?: { skip?: number; take?: number },
  ): Promise<User[]>;

  countProjectMembers(projectId: string): Promise<number>;
}
