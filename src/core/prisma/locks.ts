import type { Prisma } from '../../generated/prisma/client.js';

type Tx = Pick<Prisma.TransactionClient, '$queryRaw'>;

/**
 * Row locks for "check, then write" rules that no unique index can enforce:
 * a doctor's free time, a phone number among non-deleted clients, the last
 * admin. MySQL has no exclusion constraints, and soft-deleted rows rule out
 * plain unique indexes, so the rule is checked under a lock instead.
 *
 * Take the lock as the FIRST statement of an interactive transaction. It is
 * held until the transaction ends, so a concurrent caller waits and its
 * following reads see what the first one committed. (InnoDB creates a
 * transaction's snapshot at its first plain read; a read before the lock
 * would pin a snapshot that misses the other caller's write.)
 */

/** Serialises writes that check a clinic-wide rule (client phones, the last admin). */
export async function lockClinic(tx: Tx, clinicId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM clinics WHERE id = ${clinicId} FOR UPDATE`;
}

/** Serialises bookings for one doctor, so two can't take the same time. */
export async function lockMembership(
  tx: Tx,
  membershipId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM clinic_memberships WHERE id = ${membershipId} FOR UPDATE`;
}
