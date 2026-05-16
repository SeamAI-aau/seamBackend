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
  ApiOkResponse,
  ApiParam,
} from '@nestjs/swagger';

const MEETING_UPLOAD_AI_ENGINE_DOC = [
  '**Downstream FastAPI (ai-engine-2)**',
  '',
  'After upload, this API stores audio and dispatches to the external engine (when `AI_ENGINE_BASE_URL` is set):',
  '',
  '- `POST {AI_ENGINE_BASE_URL}/api/v1/meetings/process-audio`',
  '- `multipart/form-data`: `meeting_id`, `project_id`, `file` (binary)',
  '- **HTTP 202** + `job_id`: engine accepts the file and processes **asynchronously**; Nest waits only for download + upload (see `AI_ENGINE_REQUEST_TIMEOUT_MS`).',
  '',
  'When finished, the engine calls **`POST /internal/meetings/{meeting_id}/result`** with `x-worker-secret` and a JSON body (see tag **Internal — AI engine callbacks**).',
].join('\n');

@ApiTags('Meetings')
@ApiBearerAuth('access-token')
@Controller('projects/:projectId/meetings')
@UseGuards(JwtAuthGuard)
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload a meeting recording for a project',
    description: MEETING_UPLOAD_AI_ENGINE_DOC,
  })
  @ApiOkResponse({
    description:
      'Meeting row created; audio stored; dispatch to ai-engine completed with **HTTP 202** (processing continues in the background). Response body is only the new meeting id.',
    schema: {
      example: { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
    },
  })
  @ApiConsumes('multipart/form-data')
  upload(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserType,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.meetingService.uploadMeeting(projectId, user.userId, file);
  }

  @Get()
  @ApiOperation({
    summary: 'List meetings for a project',
    description:
      'Paginated list for project members. Meeting **status** reflects pipeline state: `UPLOADED` → `PROCESSING` (after ai-engine **202**) → `TASKS_EXTRACTED` or `FAILED` after the internal webhook or dispatch errors.',
  })
  @ApiParam({ name: 'projectId', description: 'Project UUID.' })
  @ApiOkResponse({
    description: 'Paginated meetings with task counts as returned by the service.',
    schema: {
      example: {
        items: [
          {
            id: 'meeting-uuid',
            title: 'Meeting - 2026-05-14T12:00:00.000Z',
            audioUrl: 'https://res.cloudinary.com/.../sample.mp3',
            status: 'PROCESSING',
            externalJobId: '770e8400-e29b-41d4-a716-446655440002',
            processingEngine: 'ai-engine-2',
            createdAt: '2026-05-14T12:00:00.000Z',
            _count: { tasks: 0 },
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    },
  })
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
  @ApiOperation({
    summary: 'Get one meeting with transcripts and tasks',
    description:
      'Includes transcripts and extracted tasks when processing finished (`TASKS_EXTRACTED`). While **`PROCESSING`**, transcript/tasks may still be empty until ai-engine calls **`POST /internal/meetings/{id}/result`**.',
  })
  @ApiParam({ name: 'projectId', description: 'Project UUID.' })
  @ApiParam({ name: 'meetingId', description: 'Meeting UUID.' })
  @ApiOkResponse({
    description: 'Meeting with nested transcripts and tasks.',
    schema: {
      example: {
        id: 'meeting-uuid',
        title: 'Meeting - 2026-05-14T12:00:00.000Z',
        audioUrl: 'https://res.cloudinary.com/.../sample.mp3',
        status: 'TASKS_EXTRACTED',
        projectId: 'project-uuid',
        createdAt: '2026-05-14T12:00:00.000Z',
        externalJobId: '770e8400-e29b-41d4-a716-446655440002',
        processingEngine: 'ai-engine-2',
        transcripts: [
          {
            id: 'transcript-uuid',
            version: 1,
            content: 'Speaker A: Hello...',
            diarization: { segments: [] },
            createdAt: '2026-05-14T12:05:00.000Z',
          },
        ],
        tasks: [
          {
            id: 'task-uuid',
            title: 'Ship OAuth fix',
            description: null,
            status: 'SENT_TO_DEVELOPER',
            assigneeId: 'user-uuid',
            createdAt: '2026-05-14T12:05:00.000Z',
          },
        ],
      },
    },
  })
  getByIdWithDetails(
    @Param('projectId') projectId: string,
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.meetingService.getByIdWithDetails(projectId, meetingId, user.userId);
  }
}
