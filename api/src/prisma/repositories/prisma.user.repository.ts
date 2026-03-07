import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { IUserRepository } from '../../user/user.repository';
import { Role } from '@prisma/client';

@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
    });
  }

  async findDevelopers(options?: { skip?: number; take?: number }) {
    return this.prisma.user.findMany({
      where: { role: Role.DEVELOPER },
      skip: options?.skip,
      take: options?.take,
    });
  }

  async countDevelopers() {
    return this.prisma.user.count({ where: { role: Role.DEVELOPER } });
  }

  async findProjectMembers(
    projectId: string,
    options?: { skip?: number; take?: number },
  ) {
    return this.prisma.user.findMany({
      where: {
        OR: [
          { ownedProjects: { some: { id: projectId } } },
          { projectMembers: { some: { projectId } } },
        ],
      },
      skip: options?.skip,
      take: options?.take,
    });
  }

  async countProjectMembers(projectId: string) {
    return this.prisma.user.count({
      where: {
        OR: [
          { ownedProjects: { some: { id: projectId } } },
          { projectMembers: { some: { projectId } } },
        ],
      },
    });
  }
}
