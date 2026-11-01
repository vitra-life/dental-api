import type { PrismaClient } from '../../generated/prisma/client.js';
import type { PermissionScope } from '../../generated/prisma/enums.js';
import {
  CATALOG_CODES,
  flattenCatalog,
} from '../../common/auth/permission-catalog.js';
import {
  CLINIC_ADMIN_ROLE,
  SYSTEM_ROLE_OWNER,
} from '../../common/auth/system-roles.js';

export { CLINIC_ADMIN_ROLE, SYSTEM_ROLE_OWNER };

/**
 * Data every installation needs: professional staff types, kinds of staff ↔
 * doctor relationship, the permission catalogue and the system roles.
 * `syncReferenceData` is idempotent and safe in production; it runs from
 * `npm run db:seed`, the clinic CLI and the e2e tests.
 */

export const STAFF_TYPES = [
  { code: 'doctor', name: 'پزشک' },
  { code: 'secretary', name: 'منشی' },
  { code: 'assistant', name: 'دستیار' },
] as const;

export const RELATIONSHIP_TYPES = [
  { code: 'secretary_of', name: 'منشی پزشک' },
  { code: 'assistant_of', name: 'دستیار پزشک' },
  { code: 'coordinator_of', name: 'هماهنگ‌کننده پزشک' },
  { code: 'supervisor_of', name: 'سرپرست' },
] as const;

type Grants = Record<string, PermissionScope>;

/** `items` at the given scope; unscoped items always get `clinic`. */
const grant = (scope: PermissionScope, ...items: string[]): Grants =>
  Object.fromEntries(items.map((code) => [code, scope]));

const clinicWide = (...items: string[]) => grant('clinic', ...items);

const UI_CLIENTS = clinicWide('clients', 'clients.list', 'clients.record');
const UI_APPOINTMENTS = clinicWide(
  'appointments',
  'appointments.list',
  'appointments.booking',
  'appointments.status',
);
const STAFF_READ = clinicWide(
  'settings',
  'settings.services',
  'settings.staff',
  'settings.staff.view',
);

export const SYSTEM_ROLES: { code: string; name: string; grants: Grants }[] = [
  {
    code: CLINIC_ADMIN_ROLE,
    name: 'مدیر کلینیک',
    grants: clinicWide(...CATALOG_CODES),
  },
  {
    code: 'doctor',
    name: 'پزشک',
    grants: {
      ...clinicWide('dashboard', 'clients.medical'),
      ...UI_CLIENTS,
      ...UI_APPOINTMENTS,
      ...STAFF_READ,
      ...grant(
        'own',
        'clients.list.view',
        'clients.record.view',
        'clients.record.update',
        'clients.medical.view',
      ),
      ...clinicWide('clients.record.create'),
      ...grant(
        'own',
        'appointments.list.view',
        'appointments.booking.create',
        'appointments.booking.update',
        'appointments.status.change',
        'appointments.status.cancel',
        'prescriptions.create',
      ),
    },
  },
  {
    code: 'secretary',
    name: 'منشی',
    grants: {
      ...clinicWide('dashboard', 'billing'),
      ...UI_CLIENTS,
      ...UI_APPOINTMENTS,
      ...STAFF_READ,
      ...grant(
        'assigned',
        'clients.list.view',
        'clients.record.view',
        'clients.record.update',
      ),
      ...clinicWide('clients.record.create'),
      ...grant(
        'assigned',
        'appointments.list.view',
        'appointments.booking.create',
        'appointments.booking.update',
        'appointments.status.change',
        'appointments.status.cancel',
      ),
    },
  },
  {
    code: 'assistant',
    name: 'دستیار',
    grants: {
      ...clinicWide(
        'clients',
        'clients.list',
        'clients.record',
        'appointments',
        'appointments.list',
        'appointments.status',
      ),
      ...grant(
        'assigned',
        'clients.list.view',
        'clients.record.view',
        'appointments.list.view',
        'appointments.status.change',
      ),
    },
  },
];

export async function syncReferenceData(prisma: PrismaClient): Promise<void> {
  for (const type of STAFF_TYPES) {
    await prisma.staffType.upsert({
      where: { code: type.code },
      create: type,
      update: { name: type.name },
    });
  }
  for (const type of RELATIONSHIP_TYPES) {
    await prisma.relationshipType.upsert({
      where: { code: type.code },
      create: type,
      update: { name: type.name },
    });
  }

  const rows = flattenCatalog();
  for (const row of rows) {
    const values = {
      kind: row.kind,
      parent_code: row.parent_code,
      label: row.label,
      description: row.description,
      sort_order: row.sort_order,
      is_assignable: true,
    };
    await prisma.permission.upsert({
      where: { code: row.code },
      create: { code: row.code, ...values },
      update: values,
    });
  }
  await prisma.permission.updateMany({
    where: { code: { notIn: rows.map((row) => row.code) } },
    data: { is_assignable: false },
  });

  const permissionIds = new Map(
    (
      await prisma.permission.findMany({ select: { id: true, code: true } })
    ).map((p) => [p.code, p.id]),
  );
  for (const role of SYSTEM_ROLES) {
    const saved = await prisma.role.upsert({
      where: {
        owner_key_code: { owner_key: SYSTEM_ROLE_OWNER, code: role.code },
      },
      create: {
        owner_key: SYSTEM_ROLE_OWNER,
        clinic_id: null,
        code: role.code,
        name: role.name,
        is_system: true,
      },
      update: { name: role.name, is_system: true },
    });
    // System roles cannot be edited in the app, so their grants are exactly the code's.
    const wanted = Object.entries(role.grants).map(([code, scope]) => {
      const permission_id = permissionIds.get(code);
      if (!permission_id)
        throw new Error(
          `System role ${role.code} grants unknown permission ${code}`,
        );
      return { permission_id, scope };
    });
    await prisma.rolePermission.deleteMany({
      where: {
        role_id: saved.id,
        permission_id: { notIn: wanted.map((w) => w.permission_id) },
      },
    });
    for (const { permission_id, scope } of wanted) {
      await prisma.rolePermission.upsert({
        where: { role_id_permission_id: { role_id: saved.id, permission_id } },
        create: { role_id: saved.id, permission_id, scope },
        update: { scope },
      });
    }
  }
}
