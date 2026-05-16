import {
  Controller,
  Get,
  Patch,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserService } from './user.service';
import type { CurrentUserType } from '../auth/types/current-user.type';
import { UserResponseDto } from './dto/user-response.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiConsumes,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the currently authenticated user' })
  @ApiOkResponse({
    description: 'The full profile of the currently authenticated user.',
    type: UserResponseDto,
    schema: {
      example: {
        id: 'user-123',
        email: 'scrum.master@example.com',
        name: 'Jane Doe',
        role: 'SCRUM_MASTER',
        githubUsername: 'jane-doe-dev',
        hasVoiceSample: true,
        projects: [
          { id: 'project-1', name: 'Velocity Tracker' },
          { id: 'project-2', name: 'Daily Standup Assistant' },
        ],
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  getMe(@CurrentUser() user: CurrentUserType): Promise<UserResponseDto> {
    return this.userService.getMe(user.userId);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Update current user profile',
    description:
      'Update name and/or GitHub username for developer-activity attribution. ' +
      'Does not connect GitHub OAuth — use Integrations → GitHub for that. ' +
      'For Jira attribution, use Integrations → Jira connect and POST /integrations/jira/refresh-profile.',
  })
  @ApiBody({
    type: UpdateUserProfileDto,
    examples: {
      githubOnly: {
        summary: 'Set GitHub username',
        value: { githubUsername: 'dev-one' },
      },
      nameOnly: { summary: 'Update display name', value: { name: 'Dev One' } },
    },
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({
    description: 'Validation error or no fields provided.',
    schema: { example: { statusCode: 400, message: 'At least one field is required' } },
  })
  updateMe(
    @CurrentUser() user: CurrentUserType,
    @Body() body: UpdateUserProfileDto,
  ): Promise<UserResponseDto> {
    return this.userService.updateProfile(user.userId, body);
  }

  @Patch('me/voice')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload or replace the current user voice sample',
    description:
      'Uploads a voice sample file for the authenticated user. Any existing sample will be replaced.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({
    description: 'Voice sample uploaded successfully.',
    schema: {
      example: {
        status: 'uploaded',
        hasVoiceSample: true,
      },
    },
  })
  @ApiBody({
    description: 'Multipart form data containing the audio file to upload.',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Audio file for the voice sample (e.g. audio/mpeg, audio/wav).',
        },
      },
      required: ['file'],
    },
  })
  @ApiBadRequestResponse({
    description: 'No file was provided or the file is invalid.',
    schema: {
      example: {
        statusCode: 400,
        message: 'File is required',
        error: 'Bad Request',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  uploadVoiceSample(
    @CurrentUser() user: CurrentUserType,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.userService.uploadVoiceSample(user.userId, file);
  }

  @Get('me/voice-stream')
  @ApiOperation({
    summary: 'Stream the current user voice sample',
    description:
      'Streams the stored voice sample audio for the authenticated user. The underlying Cloudinary URL is never exposed.',
  })
  @ApiOkResponse({
    description: 'Audio stream of the user voice sample.',
    content: {
      'audio/*': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  streamMyVoiceSample(@CurrentUser() user: CurrentUserType, @Res() res: Response) {
    return this.userService.streamVoiceSample(user.userId, res);
  }

  @Get('developers')
  @ApiOperation({
    summary: 'List developers (Scrum Masters only)',
    description:
      'Returns a paginated list of all users with role DEVELOPER. ' +
      'Only users with the SCRUM_MASTER role can access this endpoint. No request body.',
  })
  @ApiOkResponse({
    description:
      'Paginated list of developers. Each item matches UserResponseDto; projects is always an empty array on this route.',
    schema: {
      example: {
        items: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            email: 'dev1@example.com',
            name: 'Dev One',
            role: 'DEVELOPER',
            githubUsername: 'dev-one',
            hasVoiceSample: true,
            projects: [],
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Caller does not have the SCRUM_MASTER role.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Only Scrum Masters can view developers',
        error: 'Forbidden',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid pagination parameters.',
    schema: {
      example: {
        statusCode: 400,
        message: ['page must not be less than 1'],
        error: 'Bad Request',
      },
    },
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (1-based). Defaults to 1.',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of items per page. Defaults to 20, max 100.',
    example: 20,
  })
  getDevelopers(@CurrentUser() user: CurrentUserType, @Query() query: PaginationQueryDto) {
    return this.userService.getDevelopers(user, query.page ?? 1, query.limit ?? 20);
  }
}
