import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  async onModuleInit() {
    const timeoutMs = Number(process.env.PRISMA_CONNECT_TIMEOUT_MS || 1500);

    try {
      await Promise.race([
        this.$connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Prisma connect timeout after ${timeoutMs}ms`)), timeoutMs),
        ),
      ]);

      this.connected = true;
      this.logger.log('Prisma connected successfully');
    } catch (error) {
      this.logger.warn('Prisma connection skipped/unavailable, continuing without database access: ' + String(error));
      this.connected = false;
    }
  }

  async onModuleDestroy() {
    if (this.connected) {
      await this.$disconnect();
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}