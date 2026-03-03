import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { IMeetingRepository } from '../../meeting/types/meeting.repository';
import { Meeting, MeetingStatus, Transcript } from '@prisma/client';

@Injectable()
export class PrismaMeetingRepository implements IMeetingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { title: string; audioUrl: string; projectId: string }): Promise<Meeting> {
    return this.prisma.meeting.create({ data });
  }

  async findByProject(projectId: string): Promise<Meeting[]> {
    return this.prisma.meeting.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string): Promise<Meeting | null> {
    return this.prisma.meeting.findUnique({ where: { id } });
  }

  async updateStatus(id: string, status: MeetingStatus): Promise<Meeting> {
    return this.prisma.meeting.update({
      where: { id },
      data: { status },
    });
  }

  async addTranscript(
    meetingId: string,
    version: number,
    content: string,
    diarization: any,
  ): Promise<Transcript> {
    return this.prisma.transcript.create({
      data: { meetingId, version, content, diarization },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.meeting.delete({ where: { id } });
  }

  async existsProcessingInProject(projectId: string): Promise<boolean> {
    const count = await this.prisma.meeting.count({
      where: { projectId, status: MeetingStatus.PROCESSING },
    });
    return count > 0;
  }
}
