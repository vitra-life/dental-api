import type { PermissionScope } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../core/prisma/prisma.service.js';
import { pageOf } from './permission-catalog.js';

const RANK: Record<PermissionScope, number> = {
  own: 0,
  assigned: 1,
  clinic: 2,
};

/** The wider of two scopes. */
export const widestScope = (
  a: PermissionScope,
  b: PermissionScope,
): PermissionScope => (RANK[a] >= RANK[b] ? a : b);

/** Whether `held` covers at least as much as `wanted`. */
export const scopeCovers = (held: PermissionScope, wanted: PermissionScope) =>
  RANK[held] >= RANK[wanted];

/**
 * Merges grants from several roles: per item the widest scope wins. Then drops
 * items whose page is not granted, so "book appointments" does nothing
 * without the appointments page.
 */
export function mergeGrants(
  grants: { code: string; scope: PermissionScope }[],
): Map<string, PermissionScope> {
  const merged = new Map<string, PermissionScope>();
  for (const { code, scope } of grants) {
    const held = merged.get(code);
    merged.set(code, held ? widestScope(held, scope) : scope);
  }
  // Deleting the current key while iterating a Map is safe.
  for (const code of merged.keys()) {
    const page = pageOf(code);
    if (page && page !== code && !merged.has(page)) merged.delete(code);
  }
  return merged;
}

/**
 * A membership's effective permissions. Reads membership_roles → roles →
 * role_permissions → permissions on every call, so a change applies on the
 * next request. Only system roles and the membership's own clinic's roles
 * count (this replaces a trigger), and unassignable items are ignored.
 */
export async function effectivePermissions(
  prisma: PrismaService,
  membership: { id: string; clinic_id: string },
): Promise<Map<string, PermissionScope>> {
  const links = await prisma.membershipRole.findMany({
    where: { membership_id: membership.id, clinic_id: membership.clinic_id },
    select: { role_id: true },
  });
  if (links.length === 0) return new Map();
  const roles = await prisma.role.findMany({
    where: {
      id: { in: links.map((l) => l.role_id) },
      OR: [
        { is_system: true, clinic_id: null },
        { clinic_id: membership.clinic_id },
      ],
    },
    select: { id: true },
  });
  if (roles.length === 0) return new Map();
  const grants = await prisma.rolePermission.findMany({
    where: { role_id: { in: roles.map((r) => r.id) } },
    select: { permission_id: true, scope: true },
  });
  if (grants.length === 0) return new Map();
  const permissions = await prisma.permission.findMany({
    where: {
      id: { in: [...new Set(grants.map((g) => g.permission_id))] },
      is_assignable: true,
    },
    select: { id: true, code: true },
  });
  const codes = new Map(permissions.map((p) => [p.id, p.code]));
  return mergeGrants(
    grants.flatMap((g) => {
      const code = codes.get(g.permission_id);
      return code ? [{ code, scope: g.scope }] : [];
    }),
  );
}
