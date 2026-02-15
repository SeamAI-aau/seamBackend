import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ProjectService } from './project.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserType } from '../auth/types/current-user.type';
import { CreateProjectDto } from './dto/create-project.dto';
import { AddMemberDto } from './dto/add-member.dto';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  createProject(@CurrentUser() user: CurrentUserType, @Body() body: CreateProjectDto) {
    return this.projectService.createProject(user, body);
  }

  @Get()
  getProjects(@CurrentUser() user: CurrentUserType) {
    return this.projectService.getUserProjects(user.userId);
  }

  @Get(':id')
  getProject(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.projectService.getProject(id, user.userId);
  }

  @Post(':id/members')
  addMember(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
    @Body() body: AddMemberDto,
  ) {
    return this.projectService.addMember(id, user.userId, body.userId);
  }
}
