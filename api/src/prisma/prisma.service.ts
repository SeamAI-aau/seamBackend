import { Injectable, OnModuleInit, INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {

    constructor() {
    super();

  }

  
  async onModuleInit() {
    await this.$connect();
  }

  async enableShutdownHooks(app: INestApplication) {
    (this.$on as unknown as <T extends string>(event: T, callback: () => Promise<void>) => void)(
      'beforeExit',
      async () => {
        await app.close();
      },
    );
  }
}
