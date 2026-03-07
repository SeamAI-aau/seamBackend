import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserService } from './user.service';
import type { CurrentUserType } from '../auth/types/current-user.type';
import { UserResponseDto } from './dto/user-response.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  getMe(@CurrentUser() user: CurrentUserType): Promise<UserResponseDto> {
    return this.userService.getMe(user.userId);
  }

  @Get('developers')
  getDevelopers(
    @CurrentUser() user: CurrentUserType,
    @Query() query: PaginationQueryDto,
  ) {
    return this.userService.getDevelopers(
      user,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get('projects/:projectId/members')
  getProjectMembers(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserType,
    @Query() query: PaginationQueryDto,
  ) {
    return this.userService.getProjectMembers(
      projectId,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }
}
