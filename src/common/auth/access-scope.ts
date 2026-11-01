import type { Prisma } from '../../generated/prisma/client.js';
import type { PermissionScope } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../core/prisma/prisma.service.js';
import type { MembershipContext } from './auth-request.js';

/**
 * What each scope means for clinic data, in one place:
 * - own: records where I am the doctor (or that I created);
 * - assigned: those, plus the records of doctors I'm actively assigned to;
 * - clinic: everything in the clinic.
 */

/** The doctor memberships whose data the scope reaches, or `null` for all of the clinic. */
export async function allowedDoctorIds(
  prisma: PrismaService,
  scope: PermissionScope,
  membership: MembershipContext,
): Promise<string[] | null> {
  if (scope === 'clinic') return null;
  if (scope === 'own') return [membership.id];
  const assignments = await prisma.staffAssignment.findMany({
    where: {
      clinic_id: membership.clinic_id,
      staff_membership_id: membership.id,
      is_active: true,
    },
    select: { doctor_membership_id: true },
  });
  return [
    membership.id,
    ...new Set(assignments.map((a) => a.doctor_membership_id)),
  ];
}

/** A `where` for appointments the scope reaches. */
export async function appointmentScopeWhere(
  prisma: PrismaService,
  scope: PermissionScope,
  membership: MembershipContext,
): Promise<Prisma.AppointmentWhereInput> {
  const doctors = await allowedDoctorIds(prisma, scope, membership);
  return doctors === null ? {} : { doctor_membership_id: { in: doctors } };
}

/**
 * A `where` for clients the scope reaches: the ones I registered, or with an
 * appointment with a doctor the scope reaches.
 */
export async function clientScopeWhere(
  prisma: PrismaService,
  scope: PermissionScope,
  membership: MembershipContext,
): Promise<Prisma.ClientWhereInput> {
  const doctors = await allowedDoctorIds(prisma, scope, membership);
  if (doctors === null) return {};
  const seen = await prisma.appointment.findMany({
    where: {
      clinic_id: membership.clinic_id,
      doctor_membership_id: { in: doctors },
    },
    select: { client_id: true },
    distinct: ['client_id'],
  });
  return {
    OR: [
      { created_by_membership_id: membership.id },
      { id: { in: seen.map((a) => a.client_id) } },
    ],
  };
}
