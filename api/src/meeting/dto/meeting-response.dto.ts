import type { MeetingStatus } from '@prisma/client';

export interface MeetingSummaryDto {
  id: string;
  title: string;
  audioUrl: string;
  status: MeetingStatus;
  createdAt: Date;
}

export interface TranscriptDto {
  id: string;
  version: number;
  content: string;
  diarization: unknown;
  summary?: {
    summary: string;
    key_decisions?: string[];
    meeting_sentiment?: string;
    main_topic?: string;
  } | null;
  insights?: string[] | null;
  suggestedActions?: string[] | null;
  createdAt: Date;
}

export interface TaskSummaryDto {
  id: string;
  title: string;
  description: string | null;
  status: string;
  assigneeId: string | null;
  createdAt: Date;
}

export interface MeetingWithDetailsDto {
  id: string;
  title: string;
  audioUrl: string;
  status: MeetingStatus;
  createdAt: Date;
  transcripts: TranscriptDto[];
  tasks: TaskSummaryDto[];
}
