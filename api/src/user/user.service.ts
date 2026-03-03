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

  async getDevelopers(currentUser: CurrentUserType): Promise<UserResponseDto[]> {
    if (currentUser.role !== Role.SCRUM_MASTER) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only Scrum Masters can view developers', 403);
    }

    const developers = await this.userRepo.findDevelopers();
    return developers.map(this.toResponseDto);
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
  async getProjectMembers(projectId: string) {
    const users = await this.userRepo.findProjectMembers(projectId);

    return users.map(this.mapSafeUser);
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
