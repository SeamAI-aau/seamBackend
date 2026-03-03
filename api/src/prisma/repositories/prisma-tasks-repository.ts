import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ITaskRepository } from '../../tasks/task.repository';
import { TaskStatus } from '@prisma/client';

@Injectable()
export class PrismaTaskRepository implements ITaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.task.findUnique({
      where: { id },
    });
  }

  async updateStatus(id: string, status: TaskStatus) {
    return this.prisma.task.update({
      where: { id },
      data: {
        status,
      },
    });
  }
}
