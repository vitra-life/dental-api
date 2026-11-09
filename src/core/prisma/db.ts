import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from './prisma.service.js';

/**
 * Anything that can run queries: the Prisma service, or the client of an
 * interactive transaction. Helpers that may run inside a caller's
 * transaction take this.
 */
export type Db = PrismaService | Prisma.TransactionClient;
