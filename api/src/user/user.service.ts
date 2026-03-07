import { Inject, Injectable } from '@nestjs/common';
import { USER_REPOSITORY } from './user.token';
import type { IUserRepository } from './user.repository';
import { AppException } from '../common/errors/app.exception';
import type { User } from '@prisma/client';
import { ErrorCode } from '../common/errors/error-codes';
import { Role } from '@prisma/client';
import { UserResponseDto } from './dto/user-response.dto';
import { CurrentUserType } from '../auth/types/current-user.type';

@Injectable()
export class UserService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
  ) {}

  async getDevelopers(
    currentUser: CurrentUserType,
    page: number = 1,
    limit: number = 20,
  ) {
    if (currentUser.role !== Role.SCRUM_MASTER) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only Scrum Masters can view developers', 403);
    }

    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.userRepo.findDevelopers({ skip, take: limit }),
      this.userRepo.countDevelopers(),
    ]);
    const items = users.map(this.toResponseDto);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  async getMe(userId: string): Promise<UserResponseDto> {
    const user = await this.userRepo.findById(userId);

    if (!user) {
      throw new AppException(ErrorCode.UNAUTHORIZED, 'User not found', 401);
    }

    return this.toResponseDto(user);
  }

  private toResponseDto(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }
  async getProjectMembers(
    projectId: string,
    page: number = 1,
    limit: number = 20,
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
