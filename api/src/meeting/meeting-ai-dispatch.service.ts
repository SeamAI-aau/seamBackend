import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MeetingStatus } from '@prisma/client';
import { Logger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';

const PROCESSING_ENGINE_AI = 'ai-engine-2';

function filenameForAudioContentType(contentType: string): string {
  const mime = (contentType || '').toLowerCase();
  if (mime.includes('webm')) return 'meeting.webm';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'meeting.mp3';
  if (mime.includes('wav')) return 'meeting.wav';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'meeting.m4a';
  if (mime.includes('ogg')) return 'meeting.ogg';
  return 'meeting-audio.bin';
}

/**
 * Dispatches uploaded meeting audio to ai-engine-2
 * (`POST /api/v1/meetings/process-audio`). Requires `AI_ENGINE_BASE_URL`.
 *
 * The engine returns **202 Accepted** quickly after accepting the file; it runs
 * transcription/NLP in the background and POSTs results to
 * `POST /internal/meetings/:id/result`. Nest only waits for download + upload
 * (bounded by `AI_ENGINE_REQUEST_TIMEOUT_MS`), not for full processing.
 */
@Injectable()
export class MeetingAiDispatchService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  isAiEngineEnabled(): boolean {
    const url = this.config.get<string>('AI_ENGINE_BASE_URL')?.trim();
    return Boolean(url);
  }

  /**
   * Downloads audio from `audioUrl` (e.g. Cloudinary), POSTs multipart to ai-engine-2
   * `POST /api/v1/meetings/process-audio` with `meeting_id`, `project_id`, `file`.
   * Expects **HTTP 202** + JSON `{ status, meeting_id, project_id, job_id }`.
   * Sets meeting **PROCESSING**, `externalJobId` = `job_id`, handoff timestamps;
   * on failure sets **FAILED** and `lastProcessingError`.
   */
  async dispatchMeetingAudio(params: {
    meetingId: string;
    projectId: string;
    audioUrl: string;
  }): Promise<void> {
    const baseUrl = this.config.get<string>('AI_ENGINE_BASE_URL')?.trim()?.replace(/\/$/, '');
    /** Covers Cloudinary download + multipart upload to engine until 202 (not full AI runtime). */
    const dispatchTimeoutMs = this.config.get<number>('AI_ENGINE_REQUEST_TIMEOUT_MS') ?? 600_000;
    if (!baseUrl) {
      return;
    }

    const processUrl = `${baseUrl}/api/v1/meetings/process-audio`;
    const startedAt = new Date();

    try {
      const audioRes = await fetch(params.audioUrl, {
        signal: AbortSignal.timeout(dispatchTimeoutMs),
      });
      if (!audioRes.ok) {
        throw new Error(`Failed to download meeting audio: HTTP ${audioRes.status}`);
      }

      const arrayBuffer = await audioRes.arrayBuffer();
      const contentType =
        audioRes.headers.get('content-type') || 'application/octet-stream';
      const filename = filenameForAudioContentType(contentType);
      const blob = new Blob([arrayBuffer], { type: contentType });

      const form = new FormData();
      form.append('meeting_id', params.meetingId);
      form.append('project_id', params.projectId);
      form.append('file', blob, filename);

      const postRes = await fetch(processUrl, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(dispatchTimeoutMs),
      });

      const responseText = await postRes.text();
      if (postRes.status !== 202) {
        throw new Error(
          `AI engine expected HTTP 202, got ${postRes.status}: ${responseText.slice(0, 500)}`,
        );
      }

      let jobId: string | null = null;
      try {
        const json = JSON.parse(responseText) as {
          job_id?: string;
          meeting_id?: string;
        };
        if (typeof json.job_id === 'string' && json.job_id.trim()) {
          jobId = json.job_id.trim();
        }
        if (json.meeting_id && json.meeting_id !== params.meetingId) {
          this.logger.warn(
            { meetingId: params.meetingId, returnedMeetingId: json.meeting_id },
            'AI engine JSON meeting_id does not match dispatched meeting',
          );
        }
      } catch {
        throw new Error(
          `AI engine returned 202 but body was not JSON with job_id: ${responseText.slice(0, 300)}`,
        );
      }

      if (!jobId) {
        throw new Error('AI engine 202 response missing job_id');
      }

      await this.prisma.meeting.update({
        where: { id: params.meetingId },
        data: {
          status: MeetingStatus.PROCESSING,
          processingEngine: PROCESSING_ENGINE_AI,
          processingStartedAt: startedAt,
          externalJobId: jobId,
          lastProcessingError: null,
        },
      });

      this.logger.log(
        { meetingId: params.meetingId, projectId: params.projectId, externalJobId: jobId },
        'Meeting audio accepted by AI engine (202); processing continues via webhook',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ err, meetingId: params.meetingId }, 'AI engine dispatch failed');

      await this.prisma.meeting.update({
        where: { id: params.meetingId },
        data: {
          status: MeetingStatus.FAILED,
          lastProcessingError: message.slice(0, 8000),
        },
      });
    }
  }
}
