import type { PrismaClient } from '../../generated/prisma/client.js';
import {
  flattenCatalog,
  LEGACY_CODES,
} from '../../common/auth/permission-catalog.js';

/**
 * Data every installation needs: professional staff types, kinds of position
 * in a doctor's workspace and the permission catalogue. There are no system
 * roles: a clinic admin's workspace holds everything, and every other
 * workspace holds exactly what it was granted.
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
      group_code: row.group_code,
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
  await moveLegacyGrants(prisma);
}

/**
 * Grants on tree codes from before the per-action catalogue (kept as
 * unassignable rows) move onto the items that replace them, for templates
 * and workspaces alike; the old grant rows are then removed. Idempotent.
 */
async function moveLegacyGrants(prisma: PrismaClient): Promise<void> {
  const permissions = await prisma.permission.findMany({
    select: { id: true, code: true },
  });
  const idOf = new Map(permissions.map((p) => [p.code, p.id]));
  const legacy = permissions.filter((p) => p.code in LEGACY_CODES);
  if (legacy.length === 0) return;
  const replacements = (legacyId: string) =>
    LEGACY_CODES[legacy.find((p) => p.id === legacyId)!.code].flatMap(
      (code) => idOf.get(code) ?? [],
    );
  const legacyIds = legacy.map((p) => p.id);

  const templateItems = await prisma.permissionTemplateItem.findMany({
    where: { permission_id: { in: legacyIds } },
  });
  for (const item of templateItems) {
    for (const permission_id of replacements(item.permission_id)) {
      await prisma.permissionTemplateItem.upsert({
        where: {
          template_id_permission_id: {
            template_id: item.template_id,
            permission_id,
          },
        },
        create: { template_id: item.template_id, permission_id },
        update: {},
      });
    }
  }
  const workspaceGrants = await prisma.workspacePermission.findMany({
    where: { permission_id: { in: legacyIds } },
  });
  for (const grant of workspaceGrants) {
    for (const permission_id of replacements(grant.permission_id)) {
      await prisma.workspacePermission.upsert({
        where: {
          workspace_id_permission_id: {
            workspace_id: grant.workspace_id,
            permission_id,
          },
        },
        create: {
          clinic_id: grant.clinic_id,
          workspace_id: grant.workspace_id,
          permission_id,
        },
        update: {},
      });
    }
  }
  await prisma.permissionTemplateItem.deleteMany({
    where: { permission_id: { in: legacyIds } },
  });
  await prisma.workspacePermission.deleteMany({
    where: { permission_id: { in: legacyIds } },
  });
}
