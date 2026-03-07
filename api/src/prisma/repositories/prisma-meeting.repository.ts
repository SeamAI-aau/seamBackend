import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type {
  IMeetingRepository,
  MeetingWithTaskCount,
  MeetingWithTranscriptsAndTasks,
} from '../../meeting/types/meeting.repository';
import type { Meeting, MeetingStatus } from '@prisma/client';

@Injectable()
export class PrismaMeetingRepository implements IMeetingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    title: string;
    audioUrl: string;
    audioPublicId?: string | null;
    projectId: string;
  }): Promise<Meeting> {
    return this.prisma.meeting.create({ data });
  }

  async findByProject(projectId: string): Promise<Meeting[]> {
    return this.prisma.meeting.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByProjectWithTaskCount(
    projectId: string,
    options?: { skip?: number; take?: number },
  ): Promise<MeetingWithTaskCount[]> {
    const rows = await this.prisma.meeting.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      skip: options?.skip,
      take: options?.take,
      include: { _count: { select: { tasks: true } } },
    });
    return rows as MeetingWithTaskCount[];
  }

  async countByProject(projectId: string): Promise<number> {
    return this.prisma.meeting.count({ where: { projectId } });
  }

  async findById(id: string): Promise<Meeting | null> {
    return this.prisma.meeting.findUnique({ where: { id } });
  }

  async findByIdWithTranscriptsAndTasks(
    id: string,
  ): Promise<MeetingWithTranscriptsAndTasks | null> {
    return this.prisma.meeting.findUnique({
      where: { id },
      include: {
        transcripts: { orderBy: { version: 'asc' } },
        tasks: { orderBy: { createdAt: 'asc' } },
      },
    }) as Promise<MeetingWithTranscriptsAndTasks | null>;
  }

  async updateStatus(id: string, status: MeetingStatus): Promise<Meeting> {
    return this.prisma.meeting.update({
      where: { id },
      data: { status },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.meeting.delete({ where: { id } });
  }
}