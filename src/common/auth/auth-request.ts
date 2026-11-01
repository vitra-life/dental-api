import type { Request } from 'express';
import type { PermissionScope } from '../../generated/prisma/enums.js';

/** Who is calling: set by `AuthGuard` from the access token and its session. */
export interface AuthContext {
  user_id: string;
  session_id: string;
  /** The clinic the session works in; null until the user chooses one. */
  clinic_id: string | null;
}

/** The caller's membership in the active clinic: set by `ClinicGuard`. */
export interface MembershipContext {
  id: string;
  clinic_id: string;
  user_id: string;
}

/** The permission a handler requires and the scope the caller holds it at. */
export interface AccessContext {
  code: string;
  scope: PermissionScope;
}

export interface AuthRequest extends Request {
  auth?: AuthContext;
  clinic_id?: string;
  membership?: MembershipContext;
  /** Effective permissions in the active clinic, worked out once per request. */
  permissions?: Map<string, PermissionScope>;
  access?: AccessContext;
}
