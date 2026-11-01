import { existsSync } from 'node:fs';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { mariadbConfig } from '../../src/core/prisma/database-url.js';
import { syncReferenceData } from '../../src/modules/access/reference-data.js';

/** Runs once before the e2e files (which run side by side): makes sure the reference data exists. */
export default async function setup() {
  if (!process.env['DATABASE_URL'] && existsSync('.env'))
    process.loadEnvFile('.env');
  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(mariadbConfig(process.env['DATABASE_URL']!)),
  });
  try {
    await syncReferenceData(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
