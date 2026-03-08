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
            { members: { some: { userId } } },
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
  ): Promise<{ voiceSampleUrl: string }> {
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

    return { voiceSampleUrl: url };
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
      voiceSampleUrl: user.voiceSampleUrl ?? null,
      projects: projects ?? [],
    };
  }
  async getProjectMembers(
    projectId: string,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.userRepo.findProjectMembers(projectId, { skip, take: limit }),
      this.userRepo.countProjectMembers(projectId),
    ]);
    const items = users.map(this.mapSafeUser);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  private mapSafeUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }
}
