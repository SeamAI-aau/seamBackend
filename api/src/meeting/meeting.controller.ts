import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserType } from '../auth/types/current-user.type';
import { MeetingService } from './meeting.service';

@Controller('projects/:projectId/meetings')
@UseGuards(JwtAuthGuard)
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserType,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.meetingService.uploadMeeting(projectId, user.userId, file);
  }

  @Get()
  listByProject(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.meetingService.listByProject(projectId, user.userId);
  }

  @Get(':meetingId')
  getByIdWithDetails(
    @Param('projectId') projectId: string,
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.meetingService.getByIdWithDetails(projectId, meetingId, user.userId);
  }
}
