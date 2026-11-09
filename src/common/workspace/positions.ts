import type { Db } from '../../core/prisma/db.js';

/**
 * Workspaces every installation path creates the same way: the API (adding
 * staff), the `clinic:create` CLI and the tests. Both are idempotent and
 * take a transaction client when the caller has one.
 */

/** The doctor's own practice workspace, created if missing. It starts with no permissions. */
export async function ensureDoctorWorkspace(
  db: Db,
  clinicId: string,
  membershipId: string,
): Promise<void> {
  const existing = await db.workspace.findFirst({
    where: { clinic_id: clinicId, membership_id: membershipId, kind: 'doctor' },
    select: { id: true },
  });
  if (existing) return;
  await db.workspace.create({
    data: {
      clinic_id: clinicId,
      membership_id: membershipId,
      kind: 'doctor',
      doctor_membership_id: membershipId,
    },
  });
}

/** The member's clinic-wide admin workspace (holds every permission): created, or reactivated. */
export async function ensureAdminWorkspace(
  db: Db,
  clinicId: string,
  membershipId: string,
): Promise<void> {
  const existing = await db.workspace.findFirst({
    where: {
      clinic_id: clinicId,
      membership_id: membershipId,
      kind: 'clinic',
      is_admin: true,
    },
    select: { id: true },
  });
  if (existing) {
    await db.workspace.update({
      where: { id: existing.id, clinic_id: clinicId },
      data: { is_active: true },
    });
    return;
  }
  await db.workspace.create({
    data: {
      clinic_id: clinicId,
      membership_id: membershipId,
      kind: 'clinic',
      is_admin: true,
    },
  });
}
