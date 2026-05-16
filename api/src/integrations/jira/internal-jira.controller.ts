import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiQuery,
  ApiSecurity,
} from '@nestjs/swagger';
import { JiraContextService } from './jira-context.service';
import {
  ensureInternalServiceAuth,
  type InternalServiceHeaders,
} from '../../common/utils/internal-service-auth.util';

/**
 * Internal routes for ai-engine-2 (machine-to-machine).
 * Set `JIRA_CONTEXT_URL` to `{NEST_BASE}/internal/jira/context`.
 */
@ApiTags('Internal — AI engine Jira')
@ApiSecurity('worker-secret')
@Controller('internal/jira')
export class InternalJiraController {
  constructor(
    private readonly jiraContextService: JiraContextService,
    private readonly config: ConfigService,
  ) {}

  @Get('context')
  @ApiOperation({
    summary: 'Jira board context for meeting reconciliation (ai-engine)',
    description: [
      'Returns open issues on the linked Jira project and distinct status names for NLP reconciliation.',
      '',
      '**Auth:** `x-worker-secret` (same as `WORKER_SECRET`) **or** `x-internal-key` + `x-internal-secret` (`INTERNAL_API_KEY` / `INTERNAL_SECRET`).',
      '',
      '**Query:** `project_id` = Seam project UUID (same as `project_id` on process-audio).',
    ].join('\n'),
  })
  @ApiQuery({
    name: 'project_id',
    required: true,
    description: 'Seam project UUID.',
  })
  @ApiOkResponse({
    description: 'Board tasks and status names.',
    schema: {
      example: {
        tasks: [
          {
            task_id: 'SEAM-10',
            title: 'Fix audio upload',
            current_status: 'In Progress',
          },
        ],
        statuses: ['To Do', 'In Progress', 'Done'],
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid internal credentials.' })
  @ApiBadRequestResponse({ description: 'Jira not configured for project.' })
  getContext(
    @Query('project_id') projectId: string,
    @Headers() headers: InternalServiceHeaders,
  ) {
    try {
      ensureInternalServiceAuth(this.config, headers);
    } catch {
      throw new UnauthorizedException('Invalid internal service credentials');
    }

    const id = projectId?.trim();
    if (!id) {
      throw new BadRequestException('project_id is required');
    }

    return this.jiraContextService.getBoardContext(id);
  }
}
