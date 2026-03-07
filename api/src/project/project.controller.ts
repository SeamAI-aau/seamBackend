import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProjectService } from './project.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { CurrentUserType } from '../auth/types/current-user.type';
import { CreateProjectDto } from './dto/create-project.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { DashboardFilterDto } from './dto/dashboard-filter.dto';
import { BlockersFilterDto } from './dto/blockers-filter.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { Role } from '@prisma/client';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  createProject(@CurrentUser() user: CurrentUserType, @Body() body: CreateProjectDto) {
    return this.projectService.createProject(user, body);
  }

  @Get()
  getProjects(
    @CurrentUser() user: CurrentUserType,
    @Query() query: PaginationQueryDto,
  ) {
    return this.projectService.getUserProjects(
      user.userId,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get(':id/dashboard')
  @UseGuards(RolesGuard)
  @Roles(Role.SCRUM_MASTER)
  getDashboard(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
    @Query() query: DashboardFilterDto,
  ) {
    return this.projectService.getProjectDashboard(id, user.userId, query);
  }

  @Get(':id/blockers')
  @UseGuards(RolesGuard)
  @Roles(Role.SCRUM_MASTER)
  getBlockers(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
    @Query() query: BlockersFilterDto,
  ) {
    return this.projectService.getProjectBlockers(id, user.userId, query);
  }

  @Get(':id/config')
  getConfig(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.projectService.getProjectConfig(id, user.userId);
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

  @Get(':id/members')
  getProjectMembers(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
    @Query() query: PaginationQueryDto,
  ) {
    return this.projectService.getProjectMembers(
      id,
      user.userId,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }
}
