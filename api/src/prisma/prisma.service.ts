import { Injectable, OnModuleInit, INestApplication } from '@nestjs/common';
import { prisma } from './prisma.client';

@Injectable()
@Injectable()
export class PrismaService implements OnModuleInit {
  private client = prisma;

  async onModuleInit() {
    await this.client.$connect();
  }

  async enableShutdownHooks(app: INestApplication) {
    // cast to any to satisfy TS
    (this.client.$on as any)('beforeExit', async () => {
      await app.close();
    });
  }

  get clientInstance() {
    return this.client;
  }
}
