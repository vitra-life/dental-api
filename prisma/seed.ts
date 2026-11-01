/**
 * `npm run db:seed`:
 * - reference data every installation needs (staff types, relationship types,
 *   the permission catalogue, system roles and their grants). Idempotent and
 *   safe in production; run it after every deploy that changes the catalogue;
 * - outside production only, the dev clinic (fixed id, for local work).
 *
 * It never creates, changes or deletes clients, services, appointments,
 * users or memberships. Use `npm run clinic:create` for a clinic's first admin.
 */
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { mariadbConfig } from '../src/core/prisma/database-url.js';
import { syncReferenceData } from '../src/modules/access/reference-data.js';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

export const DEV_CLINIC_ID = '00000000-0000-7000-8000-000000000001';

// TLS when the URL asks for it (hosted MySQL such as TiDB Cloud).
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(mariadbConfig(databaseUrl)),
});
try {
  await syncReferenceData(prisma);
  console.log('Reference data is up to date');
  if (process.env['NODE_ENV'] !== 'production') {
    await prisma.clinic.upsert({
      where: { id: DEV_CLINIC_ID },
      create: { id: DEV_CLINIC_ID, name: 'کلینیک دندانپزشکی ویترا (توسعه)' },
      update: {},
    });
    console.log(`Dev clinic ${DEV_CLINIC_ID} is ready`);
  }
} finally {
  await prisma.$disconnect();
}
