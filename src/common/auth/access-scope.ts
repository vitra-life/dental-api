import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../core/prisma/prisma.service.js';
import type { WorkspaceContext } from './auth-request.js';

/**
 * Whose data a workspace sees, in one place:
 * - a doctor's workspace (the doctor's own, or a secretary's / assistant's of
 *   that doctor): that doctor's appointments, and the clients who have one
 *   with that doctor or were registered in this workspace;
 * - a clinic-wide workspace: everything in the clinic.
 * Deleted rows are never visible.
 */

/** A `where` for the appointments a workspace sees. */
export function appointmentScopeWhere(
  workspace: WorkspaceContext,
): Prisma.AppointmentWhereInput {
  return {
    clinic_id: workspace.clinic_id,
    deleted_at: null,
    ...(workspace.doctor_membership_id
      ? { doctor_membership_id: workspace.doctor_membership_id }
      : {}),
  };
}

/** A `where` for the clients a workspace sees. */
export async function clientScopeWhere(
  prisma: Pick<PrismaService, 'appointment'>,
  workspace: WorkspaceContext,
): Promise<Prisma.ClientWhereInput> {
  const base = { clinic_id: workspace.clinic_id, deleted_at: null };
  if (!workspace.doctor_membership_id) return base;
  const seen = await prisma.appointment.findMany({
    where: appointmentScopeWhere(workspace),
    select: { client_id: true },
    distinct: ['client_id'],
  });
  return {
    ...base,
    OR: [
      { created_by_workspace_id: workspace.id },
      { id: { in: seen.map((a) => a.client_id) } },
    ],
  };
}

/** Whether the workspace may book or move appointments for `doctorId`. */
export const canBookFor = (workspace: WorkspaceContext, doctorId: string) =>
  workspace.doctor_membership_id === null ||
  workspace.doctor_membership_id === doctorId;
