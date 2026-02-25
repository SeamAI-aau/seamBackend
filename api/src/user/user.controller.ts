import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserService } from './user.service';
import type{ CurrentUserType } from '../auth/types/current-user.type';
import { UserResponseDto } from './dto/user-response.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  getMe(
    @CurrentUser() user: CurrentUserType,
  ): Promise<UserResponseDto> {
    return this.userService.getMe(user.userId);
  }


  @Get('developers')
  getDevelopers(
    @CurrentUser() user: CurrentUserType,
  ): Promise<UserResponseDto[]> {
    return this.userService.getDevelopers(user);
  }


  @Get('projects/:projectId/members')
  getProjectMembers(
    @Param('projectId') projectId: string,
  ): Promise<UserResponseDto[]> {
    return this.userService.getProjectMembers(projectId);
  }
}