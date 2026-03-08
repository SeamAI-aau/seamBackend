import {
  Controller,
  Post,
  Param,
  UseGuards,
  Body,
  Get,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserType } from '../auth/types/current-user.type';
import { Roles } from '../common/decorators/roles.decorator';
import { Role, TaskStatus } from '@prisma/client';

import { TaskService } from './task.service';
import { AssignTaskDto } from './dto/assign-task.dto';
import { TaskFilterQueryDto } from './dto/task-filter-query.dto';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.taskService.approveTask(id, user.userId);
  }

  @Post(':id/decline')
  decline(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.taskService.declineTask(id, user.userId);
  }

  @Post(':id/send-to-developer')
  @Roles(Role.SCRUM_MASTER)
  sendToDeveloper(
    @Param('id') id: string,
    @Body() body: AssignTaskDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.taskService.sendToDeveloper(id, user, body.assigneeId);
  }

  @Post(':id/unassign')
  @Roles(Role.SCRUM_MASTER)
  unassign(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.taskService.unassignTask(id, user);
  }

  @Get('by-project/:projectId')
  getByProject(
    @Param('projectId') projectId: string,
    @Query() query: TaskFilterQueryDto,
  ) {
    return this.taskService.getTasksByProject(
      {
        projectId,
        status: query.status as TaskStatus | undefined,
        assigneeId: query.assigneeId,
      },
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get('by-meeting/:meetingId')
  getByMeeting(
    @Param('meetingId') meetingId: string,
    @Query() query: TaskFilterQueryDto,
  ) {
    return this.taskService.getTasksByMeeting(
      {
        meetingId,
        status: query.status as TaskStatus | undefined,
        assigneeId: query.assigneeId,
      },
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get('my')
  getMyTasks(
    @CurrentUser() user: CurrentUserType,
    @Query() query: TaskFilterQueryDto,
  ) {
    return this.taskService.getTasksForAssignee(
      user.userId,
      query.status as TaskStatus | undefined,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get(':id')
  getById(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.taskService.getById(id, user.userId);
  }
}
