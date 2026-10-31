import type { PrismaService } from '../../core/prisma/prisma.service.js';

export const DOCTOR_STAFF_TYPE = 'doctor';

/** The active memberships of `clinicId` that have the doctor staff type. */
export async function doctorMembershipIds(
  prisma: PrismaService,
  clinicId: string,
): Promise<string[]> {
  const doctorType = await prisma.staffType.findUnique({
    where: { code: DOCTOR_STAFF_TYPE },
    select: { id: true },
  });
  if (!doctorType) return [];
  const links = await prisma.membershipStaffType.findMany({
    where: { clinic_id: clinicId, staff_type_id: doctorType.id },
    select: { membership_id: true },
  });
  if (links.length === 0) return [];
  const active = await prisma.clinicMembership.findMany({
    where: {
      id: { in: links.map((l) => l.membership_id) },
      clinic_id: clinicId,
      is_active: true,
    },
    select: { id: true },
  });
  return active.map((m) => m.id);
}

/** Whether `membershipId` is an active doctor of `clinicId`. */
export async function isActiveDoctor(
  prisma: PrismaService,
  clinicId: string,
  membershipId: string,
): Promise<boolean> {
  return (await doctorMembershipIds(prisma, clinicId)).includes(membershipId);
}

/** Full names of the users behind memberships, keyed by membership id. */
export async function memberNames(
  prisma: PrismaService,
  membershipIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(membershipIds)];
  if (ids.length === 0) return new Map();
  const memberships = await prisma.clinicMembership.findMany({
    where: { id: { in: ids } },
    select: { id: true, user_id: true },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: memberships.map((m) => m.user_id) } },
    select: { id: true, full_name: true },
  });
  const name = new Map(users.map((u) => [u.id, u.full_name]));
  return new Map(
    memberships.flatMap((m) =>
      name.has(m.user_id) ? [[m.id, name.get(m.user_id)!] as const] : [],
    ),
  );
}
