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

@Injectable()
export class UserService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    private readonly cloudinaryService: CloudinaryService,
    private readonly prisma: PrismaService,
  ) {}

  async getDevelopers(
    currentUser: CurrentUserType,
    page = 1,
    limit = 20,
  ) {
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
          OR: [
            { ownerId: userId },
            { members: { some: { userId, status: 'ACTIVE' } } },
          ],
        },
        select: { id: true, name: true },
      }),
    ]);

    if (!user) {
      throw new AppException(ErrorCode.UNAUTHORIZED, 'User not found', 401);
    }

    return this.toResponseDto(user, projects);
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

    const { url, publicId } = await this.cloudinaryService.uploadVoiceSample(
      file,
      userId,
    );

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
      throw new AppException(
        ErrorCode.NOT_FOUND,
        'No voice sample uploaded for this user',
        404,
      );
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

  private toResponseDto(
    user: User,
    projects?: { id: string; name: string }[],
  ): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      githubUsername: user.githubUsername ?? null,
      hasVoiceSample: !!user.voiceSamplePublicId,
      projects: projects ?? [],
    };
  }
}
