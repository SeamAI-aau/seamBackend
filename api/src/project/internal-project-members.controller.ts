import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ensureInternalServiceAuth,
  type InternalServiceHeaders,
} from '../common/utils/internal-service-auth.util';
import { Inject } from '@nestjs/common';
import { PROJECT_REPOSITORY } from './types/project.tokens';
import type { IProjectRepository } from './types/project.repository';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectMemberStatus } from '@prisma/client';

type MemberDirectoryEntry = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  aliases: string[];
};

@Controller('internal/projects')
export class InternalProjectMembersController {
  constructor(
    private readonly config: ConfigService,
    @Inject(PROJECT_REPOSITORY) private readonly projectRepo: IProjectRepository,
    private readonly prisma: PrismaService,
  ) {}

  @Get('members')
  async getMemberDirectory(
    @Query('project_id') projectId: string,
    @Headers() headers: InternalServiceHeaders,
  ): Promise<{ members: MemberDirectoryEntry[] }> {
    try {
      ensureInternalServiceAuth(this.config, headers);
    } catch {
      throw new UnauthorizedException('Invalid internal service credentials');
    }

    const id = projectId?.trim();
    if (!id) {
      throw new BadRequestException('project_id is required');
    }

    const [project, members] = await Promise.all([
      this.prisma.project.findUnique({
        where: { id },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      }),
      this.projectRepo.findMembersByProject(id),
    ]);

    if (!project) {
      return { members: [] };
    }

    const memberMap = new Map<string, MemberDirectoryEntry>();

    if (project.owner) {
      memberMap.set(project.owner.id, this.toMemberDirectoryEntry(project.owner));
    }

    for (const member of members) {
      if (
        member.status !== ProjectMemberStatus.ACTIVE ||
        !member.userId ||
        !member.user
      ) {
        continue;
      }
      memberMap.set(member.user.id, this.toMemberDirectoryEntry(member.user));
    }

    return { members: [...memberMap.values()] };
  }

  private toMemberDirectoryEntry(user: {
    id: string;
    name: string | null;
    email: string;
    role: string;
  }): MemberDirectoryEntry {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      aliases: this.buildAliases(user.name, user.email),
    };
  }

  private buildAliases(name: string | null, email: string): string[] {
    const values = new Set<string>();
    const normalizedName = (name ?? '').trim().toLowerCase();
    const normalizedEmail = (email ?? '').trim().toLowerCase();

    if (normalizedName) {
      values.add(normalizedName);
      const compactName = normalizedName.replace(/\s+/g, ' ');
      values.add(compactName);
      for (const token of compactName.split(' ')) {
        if (token.length >= 2) {
          values.add(token);
        }
      }
    }

    if (normalizedEmail) {
      values.add(normalizedEmail);
      const [localPart] = normalizedEmail.split('@');
      if (localPart) {
        values.add(localPart);
        values.add(localPart.replace(/[._-]+/g, ' ').trim());
      }
    }

    return [...values].filter(Boolean);
  }
}
