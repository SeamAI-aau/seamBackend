import { Inject, Injectable } from '@nestjs/common';
import { USER_REPOSITORY } from './user.token';
import type { IUserRepository } from './user.repository';
import { AppException } from '../common/errors/app.exception';
import type { User } from '@prisma/client';
import { ErrorCode } from '../common/errors/error-codes';
import { Role } from '@prisma/client';
import { UserResponseDto } from './dto/user-response.dto';
import { CurrentUserType } from '../auth/types/current-user.type';
import { CloudinaryService } from '../infrastracture/cloudinary/cloudinary.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Response } from 'express';
import type { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import {
  AVATAR_ALLOWED_MIME_TYPES,
  AVATAR_MAX_BYTES,
} from './constants/avatar-upload.constants';
import { ProjectService } from '../project/project.service';

@Injectable()
export class UserService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    private readonly cloudinaryService: CloudinaryService,
    private readonly prisma: PrismaService,
    private readonly projectService: ProjectService,
  ) {}

  async getDevelopers(currentUser: CurrentUserType, page = 1, limit = 20) {
    if (currentUser.role !== Role.SCRUM_MASTER) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only Scrum Masters can view developers', 403);
    }

    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.userRepo.findDevelopers({ skip, take: limit }),
      this.userRepo.countDevelopers(),
    ]);
    const items = users.map((user) => this.toResponseDto(user));
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  async getMe(userId: string): Promise<UserResponseDto> {
    const [user, projects] = await Promise.all([
      this.userRepo.findById(userId),
      this.prisma.project.findMany({
        where: {
          OR: [{ ownerId: userId }, { members: { some: { userId, status: 'ACTIVE' } } }],
        },
        select: { id: true, name: true },
      }),
    ]);

    if (!user) {
      throw new AppException(ErrorCode.UNAUTHORIZED, 'User not found', 401);
    }

    return this.toResponseDto(user, projects);
  }

  getMyInvitations(userId: string) {
    return this.projectService.getMyInvitations(userId);
  }

  async updateProfile(userId: string, body: UpdateUserProfileDto): Promise<UserResponseDto> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new AppException(ErrorCode.UNAUTHORIZED, 'User not found', 401);
    }

    const data: { name?: string; githubUsername?: string | null } = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.githubUsername !== undefined) {
      const trimmed = body.githubUsername.trim();
      data.githubUsername = trimmed.length > 0 ? trimmed : null;
    }

    if (Object.keys(data).length === 0) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'At least one field is required', 400);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    const projects = await this.prisma.project.findMany({
      where: {
        OR: [{ ownerId: userId }, { members: { some: { userId, status: 'ACTIVE' } } }],
      },
      select: { id: true, name: true },
    });

    return this.toResponseDto(updated, projects);
  }

  /**
   * Upload profile avatar image. Replaces any existing avatar; old Cloudinary asset is deleted.
   */
  async uploadAvatar(
    userId: string,
    file: Express.Multer.File,
  ): Promise<{ status: string; avatarUrl: string }> {
    if (!file) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'File is required', 400);
    }

    if (!file.mimetype || !AVATAR_ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Avatar must be a JPG, PNG, GIF, or WebP image',
        400,
      );
    }

    if (file.size > AVATAR_MAX_BYTES) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Avatar must be 2MB or smaller', 400);
    }

    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new AppException(ErrorCode.UNAUTHORIZED, 'User not found', 401);
    }

    const { url, publicId } = await this.cloudinaryService.uploadAvatar(file, userId);

    if (user.avatarPublicId) {
      try {
        await this.cloudinaryService.deleteByPublicId(user.avatarPublicId, 'image');
      } catch {
        // Non-fatal; new avatar is saved
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: url, avatarPublicId: publicId },
    });

    return { status: 'uploaded', avatarUrl: url };
  }

  /**
   * Upload voice sample for profile setup (transcription/speaker recognition).
   * Replaces any existing sample; old Cloudinary asset is deleted.
   */
  async uploadVoiceSample(
    userId: string,
    file: Express.Multer.File,
  ): Promise<{ status: string; hasVoiceSample: boolean }> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new AppException(ErrorCode.UNAUTHORIZED, 'User not found', 401);
    }

    const { url, publicId } = await this.cloudinaryService.uploadVoiceSample(file, userId);

    if (user.voiceSamplePublicId) {
      try {
        await this.cloudinaryService.deleteByPublicId(user.voiceSamplePublicId);
      } catch {
        // Non-fatal; new sample is saved
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { voiceSampleUrl: url, voiceSamplePublicId: publicId },
    });

    return { status: 'uploaded', hasVoiceSample: true };
  }

  /**
   * Stream the user's voice sample audio through the HTTP response.
   * The Cloudinary URL is never exposed to the client.
   */
  async streamVoiceSample(userId: string, res: Response): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user || !user.voiceSamplePublicId || !user.voiceSampleUrl) {
      throw new AppException(ErrorCode.NOT_FOUND, 'No voice sample uploaded for this user', 404);
    }

    const stream = await this.cloudinaryService.getVoiceSampleStream(user.voiceSampleUrl);

    const contentType = stream.headers['content-type'] ?? 'audio/*';

    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=0, must-revalidate',
    });

    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(502).end();
      }
    });

    stream.pipe(res);
  }

  async transferOwnership(
    userId: string,
    projectId: string,
    newOwnerUserId: string,
  ): Promise<{ message: string }> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Project not found', 404);
    }
    if (project.ownerId !== userId) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only the project owner can transfer ownership', 403);
    }
    if (newOwnerUserId === userId) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Cannot transfer ownership to yourself', 400);
    }

    const newOwnerMembership = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: newOwnerUserId, status: 'ACTIVE' },
    });
    if (!newOwnerMembership) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'New owner must be an active member of the project', 400);
    }

    await this.prisma.$transaction([
      this.prisma.project.update({
        where: { id: projectId },
        data: { ownerId: newOwnerUserId },
      }),
      this.prisma.projectMember.delete({ where: { id: newOwnerMembership.id } }),
    ]);

    return { message: `Ownership of "${project.name}" transferred successfully` };
  }

  async getOwnedProjects(userId: string) {
    return this.prisma.project.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        name: true,
        members: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            userId: true,
            email: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
  }

  async deleteAccount(userId: string, password: string): Promise<{ message: string }> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new AppException(ErrorCode.UNAUTHORIZED, 'User not found', 401);
    }

    if (!user.passwordHash) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Cannot delete OAuth-only account via this endpoint', 400);
    }

    const { compare } = await import('bcryptjs');
    const valid = await compare(password, user.passwordHash);
    if (!valid) {
      throw new AppException(ErrorCode.INVALID_CREDENTIALS, 'Incorrect password', 401);
    }

    const ownedProjects = await this.prisma.project.findMany({
      where: { ownerId: userId },
      select: { id: true, name: true },
    });
    if (ownedProjects.length > 0) {
      const names = ownedProjects.map((p) => p.name);
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        `You must transfer ownership of your projects before deleting your account: ${names.join(', ')}`,
        400,
      );
    }

    const activeProjects = await this.prisma.projectMember.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { project: { select: { id: true, name: true } } },
    });
    if (activeProjects.length > 0) {
      const projectNames = activeProjects.map((m) => m.project.name);
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        `You must leave all projects before deleting your account. Active projects: ${projectNames.join(', ')}`,
        400,
      );
    }

    if (user.avatarPublicId) {
      try {
        await this.cloudinaryService.deleteByPublicId(user.avatarPublicId, 'image');
      } catch { /* non-fatal */ }
    }
    if (user.voiceSamplePublicId) {
      try {
        await this.cloudinaryService.deleteByPublicId(user.voiceSamplePublicId);
      } catch { /* non-fatal */ }
    }

    const meetingsToReassign = await this.prisma.meeting.findMany({
      where: { createdById: userId },
      select: { id: true, projectId: true },
    });

    const reassignOps = [];
    for (const meeting of meetingsToReassign) {
      const project = await this.prisma.project.findUnique({
        where: { id: meeting.projectId },
        select: { ownerId: true },
      });
      if (project) {
        reassignOps.push(
          this.prisma.meeting.update({
            where: { id: meeting.id },
            data: { createdById: project.ownerId },
          }),
        );
      }
    }

    await this.prisma.$transaction([
      ...reassignOps,
      this.prisma.jiraAccount.deleteMany({ where: { userId } }),
      this.prisma.activityLog.updateMany({ where: { userId }, data: { userId: null } }),
      this.prisma.developerActivity.updateMany({ where: { userId }, data: { userId: null } }),
      this.prisma.task.updateMany({ where: { assigneeId: userId }, data: { assigneeId: null } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);

    return { message: 'Account deleted successfully' };
  }

  async leaveProject(userId: string, projectId: string): Promise<{ message: string }> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Project not found', 404);
    }

    if (project.ownerId === userId) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Project owners cannot leave their own project. Transfer ownership or delete the project instead.',
        403,
      );
    }

    const membership = await this.prisma.projectMember.findFirst({
      where: { projectId, userId, status: 'ACTIVE' },
    });

    if (!membership) {
      throw new AppException(ErrorCode.NOT_FOUND, 'You are not an active member of this project', 404);
    }

    await this.prisma.projectMember.delete({ where: { id: membership.id } });

    return { message: `You have left "${project.name}"` };
  }

  private toResponseDto(user: User, projects?: { id: string; name: string }[]): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      githubUsername: user.githubUsername ?? null,
      avatarUrl: user.avatarUrl ?? null,
      hasVoiceSample: !!user.voiceSamplePublicId,
      emailVerified: !!user.emailVerifiedAt,
      projects: projects ?? [],
    };
  }
}
