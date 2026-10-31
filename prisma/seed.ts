/**
 * Development setup: makes sure the dev clinic exists. Run with
 * `npm run db:seed`. It never creates, changes or deletes clients, services or
 * appointments, so it is safe to run on a database with real data.
 *
 * The clinic id is fixed because Dental-App sends it as `x-clinic-id`
 * (`VITE_CLINIC_ID`) until login exists.
 */
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { mariadbConfig } from '../src/core/prisma/database-url.js';

if (process.env['NODE_ENV'] === 'production') {
  throw new Error('The dev seed must not run in production');
}
const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

export const DEV_CLINIC_ID = '00000000-0000-7000-8000-000000000001';

// TLS when the URL asks for it (hosted MySQL such as TiDB Cloud).
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(mariadbConfig(databaseUrl)),
});
try {
  await prisma.clinic.upsert({
    where: { id: DEV_CLINIC_ID },
    create: { id: DEV_CLINIC_ID, name: 'کلینیک دندانپزشکی ویترا (توسعه)' },
    update: {},
  });
  console.log(`Dev clinic ${DEV_CLINIC_ID} is ready`);
} finally {
  await prisma.$disconnect();
}
