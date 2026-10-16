import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { Env } from '../config/env.js';
import { PrismaClient } from '../../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService<Env, true>) {
    // Prisma talks to MySQL through the MariaDB driver adapter.
    super({
      adapter: new PrismaMariaDb(config.get('DATABASE_URL', { infer: true })),
    });
  }

  /**
   * A wrong or unreachable database stops startup. A real query is needed:
   * with a driver adapter, `$connect()` resolves even when the server is down.
   */
  async onModuleInit() {
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
