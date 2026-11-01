/**
 * Creates a clinic (or uses an existing one) and its first admin.
 *
 *   npm run clinic:create -- --name "کلینیک مهر" --admin-mobile 09121234567 --admin-name "دکتر احمدی"
 *   npm run clinic:create -- --clinic-id <id> --admin-mobile 09121234567 --admin-name "…" [--staff-type doctor]
 *
 * A new admin account gets a temporary password, printed once; it must be
 * changed at first login. An existing account (same mobile) keeps its password.
 */
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  hashPassword,
  temporaryPassword,
} from '../src/common/auth/password.js';
import {
  CLINIC_ADMIN_ROLE,
  SYSTEM_ROLE_OWNER,
} from '../src/common/auth/system-roles.js';
import { toLatinDigits } from '../src/common/validators/transforms.js';
import { mariadbConfig } from '../src/core/prisma/database-url.js';
import { syncReferenceData } from '../src/modules/access/reference-data.js';

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    'clinic-id': { type: 'string' },
    'admin-mobile': { type: 'string' },
    'admin-name': { type: 'string' },
    'staff-type': { type: 'string', multiple: true },
  },
});

function fail(message: string): never {
  console.error(`clinic:create: ${message}`);
  process.exit(1);
}

const mobile = toLatinDigits(values['admin-mobile'] ?? '').trim();
if (!/^09\d{9}$/.test(mobile))
  fail('--admin-mobile must be a mobile number like 09121234567');
if (!values['admin-name']?.trim()) fail('--admin-name is required');
if (!values.name && !values['clinic-id'])
  fail('give --name for a new clinic or --clinic-id for an existing one');

if (!process.env['DATABASE_URL'] && existsSync('.env'))
  process.loadEnvFile('.env');
const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) fail('DATABASE_URL is not set');

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(mariadbConfig(databaseUrl)),
});
try {
  await syncReferenceData(prisma);

  const clinic = values['clinic-id']
    ? ((await prisma.clinic.findUnique({
        where: { id: values['clinic-id'] },
      })) ?? fail(`no clinic with id ${values['clinic-id']}`))
    : await prisma.clinic.create({ data: { name: values.name!.trim() } });

  let user = await prisma.user.findUnique({ where: { mobile } });
  let password: string | null = null;
  if (!user) {
    password = temporaryPassword();
    user = await prisma.user.create({
      data: {
        full_name: values['admin-name']!.trim(),
        mobile,
        password_hash: await hashPassword(password),
        must_change_password: true,
      },
    });
  }

  const membership = await prisma.clinicMembership.upsert({
    where: { clinic_id_user_id: { clinic_id: clinic.id, user_id: user.id } },
    create: { clinic_id: clinic.id, user_id: user.id },
    update: { is_active: true },
  });
  const adminRole = await prisma.role.findUniqueOrThrow({
    where: {
      owner_key_code: { owner_key: SYSTEM_ROLE_OWNER, code: CLINIC_ADMIN_ROLE },
    },
  });
  await prisma.membershipRole.upsert({
    where: {
      membership_id_role_id: {
        membership_id: membership.id,
        role_id: adminRole.id,
      },
    },
    create: {
      clinic_id: clinic.id,
      membership_id: membership.id,
      role_id: adminRole.id,
    },
    update: {},
  });
  for (const code of values['staff-type'] ?? []) {
    const type =
      (await prisma.staffType.findUnique({ where: { code } })) ??
      fail(`unknown staff type ${code}`);
    await prisma.membershipStaffType.upsert({
      where: {
        membership_id_staff_type_id: {
          membership_id: membership.id,
          staff_type_id: type.id,
        },
      },
      create: {
        clinic_id: clinic.id,
        membership_id: membership.id,
        staff_type_id: type.id,
      },
      update: {},
    });
  }

  console.log(`Clinic:      ${clinic.name} (${clinic.id})`);
  console.log(
    `Admin:       ${user.full_name} (${user.mobile}), membership ${membership.id}`,
  );
  console.log(
    password
      ? `Temporary password (shown once; must be changed at first login): ${password}`
      : 'The account already existed and keeps its password.',
  );
} finally {
  await prisma.$disconnect();
}
