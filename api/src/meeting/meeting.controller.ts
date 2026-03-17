import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserType } from '../auth/types/current-user.type';
import { MeetingService } from './meeting.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';

@ApiTags('Meetings')
@ApiBearerAuth('access-token')
@Controller('projects/:projectId/meetings')
@UseGuards(JwtAuthGuard)
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a meeting recording for a project' })
  @ApiConsumes('multipart/form-data')
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
    @Query() query: PaginationQueryDto,
  ) {
    return this.meetingService.listByProject(
      projectId,
      user.userId,
      query.page ?? 1,
      query.limit ?? 20,
    );
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
