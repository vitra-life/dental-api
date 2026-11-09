import { CATALOG_CODES } from './permission-catalog.js';
import type { Db } from '../../core/prisma/db.js';

/**
 * A workspace's permission codes. An admin workspace holds every catalogue
 * item; any other holds exactly its grants. Read on every request, so a change
 * applies on the next one. Items removed from the catalogue are ignored.
 */
export async function workspacePermissions(
  prisma: Db,
  workspace: { id: string; is_admin: boolean },
): Promise<Set<string>> {
  if (workspace.is_admin) return new Set(CATALOG_CODES);
  const grants = await prisma.workspacePermission.findMany({
    where: { workspace_id: workspace.id },
    select: { permission_id: true },
  });
  if (grants.length === 0) return new Set();
  const permissions = await prisma.permission.findMany({
    where: {
      id: { in: grants.map((g) => g.permission_id) },
      is_assignable: true,
    },
    select: { code: true },
  });
  return new Set(permissions.map((p) => p.code));
}
