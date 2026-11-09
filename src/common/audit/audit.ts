import type { Prisma } from '../../generated/prisma/client.js';
import type { MembershipContext } from '../auth/auth-request.js';
import type { Db } from '../../core/prisma/db.js';

export interface AuditEntry {
  /** e.g. workspace.permissions_set, client.deleted, appointment.cancelled */
  action: string;
  resource_type: string;
  resource_id?: string | null;
  details?: Prisma.InputJsonValue;
}

/** Records a sensitive change made by `actor` in its clinic. */
export async function audit(
  prisma: Db,
  actor: MembershipContext,
  entry: AuditEntry,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      clinic_id: actor.clinic_id,
      actor_membership_id: actor.id,
      action: entry.action,
      resource_type: entry.resource_type,
      resource_id: entry.resource_id ?? null,
      details: entry.details,
    },
  });
}
