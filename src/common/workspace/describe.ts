import type {
  Workspace,
  WorkspaceKind,
} from '../../generated/prisma/client.js';
import { memberNames } from '../staff/doctors.js';
import type { Db } from '../../core/prisma/db.js';

/** A workspace with the names the screens show. */
export interface WorkspaceSummary {
  id: string;
  clinic_id: string;
  membership_id: string;
  kind: WorkspaceKind;
  doctor_membership_id: string | null;
  doctor_name: string | null;
  /** For staff workspaces: secretary_of, assistant_of, ... */
  relationship_type: string | null;
  is_admin: boolean;
  is_active: boolean;
  /** e.g. «مدیر کلینیک», «مطب خودم», «دستیار پزشک: دکتر الف» */
  label: string;
}

/** Adds doctor and relationship names to workspace rows, with two queries for all of them. */
export async function describeWorkspaces(
  prisma: Db,
  workspaces: Workspace[],
): Promise<WorkspaceSummary[]> {
  if (workspaces.length === 0) return [];
  const relationshipIds = [
    ...new Set(workspaces.flatMap((w) => w.relationship_type_id ?? [])),
  ];
  const [relationships, doctorNames] = await Promise.all([
    relationshipIds.length
      ? prisma.relationshipType.findMany({
          where: { id: { in: relationshipIds } },
        })
      : Promise.resolve([]),
    memberNames(
      prisma,
      workspaces.flatMap((w) => w.doctor_membership_id ?? []),
    ),
  ]);
  const relationship = new Map(relationships.map((r) => [r.id, r]));
  return workspaces.map((w) => {
    const type = w.relationship_type_id
      ? relationship.get(w.relationship_type_id)
      : undefined;
    const doctorName = w.doctor_membership_id
      ? (doctorNames.get(w.doctor_membership_id) ?? null)
      : null;
    return {
      id: w.id,
      clinic_id: w.clinic_id,
      membership_id: w.membership_id,
      kind: w.kind,
      doctor_membership_id: w.doctor_membership_id,
      doctor_name: doctorName,
      relationship_type: type?.code ?? null,
      is_admin: w.is_admin,
      is_active: w.is_active,
      label: workspaceLabel(w, type?.name ?? null, doctorName),
    };
  });
}

export function workspaceLabel(
  workspace: Pick<Workspace, 'kind' | 'is_admin'>,
  relationshipName: string | null,
  doctorName: string | null,
): string {
  if (workspace.is_admin) return 'مدیر کلینیک';
  switch (workspace.kind) {
    case 'doctor':
      return 'مطب خودم';
    case 'clinic':
      return 'کل کلینیک';
    case 'staff':
      return `${relationshipName ?? 'همکار پزشک'}: ${doctorName ?? '—'}`;
  }
}
