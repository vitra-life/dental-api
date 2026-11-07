import type { Request } from 'express';
import type { WorkspaceKind } from '../../generated/prisma/enums.js';

/** Who is calling: set by `AuthGuard` from the access token and its session. */
export interface AuthContext {
  user_id: string;
  session_id: string;
  /** The workspace the session works in; null until the user chooses one. */
  workspace_id: string | null;
}

/** The caller's membership in the workspace's clinic: set by `WorkspaceGuard`. */
export interface MembershipContext {
  id: string;
  clinic_id: string;
  user_id: string;
}

/**
 * The position the caller works in: set by `WorkspaceGuard`. It decides
 * whose data they see (`doctor_membership_id`, or the whole clinic when null)
 * and, through its grants, what they may do.
 */
export interface WorkspaceContext {
  id: string;
  clinic_id: string;
  membership_id: string;
  kind: WorkspaceKind;
  doctor_membership_id: string | null;
  is_admin: boolean;
}

export interface AuthRequest extends Request {
  auth?: AuthContext;
  clinic_id?: string;
  membership?: MembershipContext;
  workspace?: WorkspaceContext;
  /** The active workspace's permission codes, worked out once per request. */
  permissions?: ReadonlySet<string>;
}
