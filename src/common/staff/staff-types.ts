import type { Db } from '../../core/prisma/db.js';

/** The staff type codes of several memberships, keyed by membership id, with two queries for all of them. */
export async function staffTypesOf(
  db: Db,
  membershipIds: string[],
): Promise<Map<string, string[]>> {
  if (membershipIds.length === 0) return new Map();
  const links = await db.membershipStaffType.findMany({
    where: { membership_id: { in: membershipIds } },
    select: { membership_id: true, staff_type_id: true },
  });
  if (links.length === 0) return new Map();
  const types = await db.staffType.findMany({
    where: { id: { in: [...new Set(links.map((l) => l.staff_type_id))] } },
    select: { id: true, code: true },
  });
  const code = new Map(types.map((t) => [t.id, t.code]));
  const result = new Map<string, string[]>();
  for (const link of links) {
    const typeCode = code.get(link.staff_type_id);
    if (!typeCode) continue;
    result.set(link.membership_id, [
      ...(result.get(link.membership_id) ?? []),
      typeCode,
    ]);
  }
  return result;
}
