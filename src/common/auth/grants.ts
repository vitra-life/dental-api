import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { grantsBeyond } from './delegation.js';
import type { Db } from '../../core/prisma/db.js';

/**
 * The permission ids for `codes`, after checking that each is a current
 * catalogue item (400 otherwise) and that the caller holds it (403
 * otherwise: nobody can grant what they don't have).
 */
export async function grantablePermissionIds(
  prisma: Db,
  caller: ReadonlySet<string>,
  codes: readonly string[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(codes)];
  const permissions = await prisma.permission.findMany({
    where: { code: { in: wanted }, is_assignable: true },
    select: { id: true, code: true },
  });
  const idOf = new Map(permissions.map((p) => [p.code, p.id]));
  const unknown = wanted.filter((code) => !idOf.has(code));
  if (unknown.length > 0) {
    throw new BadRequestException({
      message: 'Unknown permission codes',
      details: { codes: unknown },
    });
  }
  const beyond = grantsBeyond(caller, wanted);
  if (beyond.length > 0) {
    throw new ForbiddenException({
      message: 'You can only grant permissions you hold yourself',
      details: { permissions: beyond },
    });
  }
  return idOf;
}

/** Codes for permission ids, in catalogue order; removed items are left out. */
export async function codesOf(
  prisma: Db,
  permissionIds: string[],
): Promise<Map<string, string>> {
  if (permissionIds.length === 0) return new Map();
  const permissions = await prisma.permission.findMany({
    where: { id: { in: [...new Set(permissionIds)] }, is_assignable: true },
    select: { id: true, code: true },
    orderBy: { sort_order: 'asc' },
  });
  return new Map(permissions.map((p) => [p.id, p.code]));
}

/**
 * The codes of `permissionIds` in catalogue order, as `codesOf` returned
 * them; ids it left out (removed items) are skipped.
 */
export function orderedCodes(
  permissionIds: string[],
  codeOf: Map<string, string>,
): string[] {
  const rank = new Map([...codeOf.keys()].map((id, index) => [id, index]));
  return permissionIds
    .filter((id) => rank.has(id))
    .sort((a, b) => rank.get(a)! - rank.get(b)!)
    .map((id) => codeOf.get(id)!);
}
