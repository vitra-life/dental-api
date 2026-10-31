import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type {
  AccessContext,
  AuthContext,
  AuthRequest,
  MembershipContext,
} from './auth-request.js';
import type { PermissionScope } from '../../generated/prisma/enums.js';
import type { PermissionCode } from './permission-catalog.js';

export const IS_PUBLIC = 'auth:public';
export const ALLOW_TEMPORARY_PASSWORD = 'auth:allow-temporary-password';
export const REQUIRED_PERMISSION = 'auth:required-permission';

/** No login needed (login, refresh, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Reachable while the user still has a temporary password (me, change-password, logout). */
export const AllowTemporaryPassword = () =>
  SetMetadata(ALLOW_TEMPORARY_PASSWORD, true);

/** The catalogue item the caller must hold in the active clinic. */
export const RequirePermission = (code: PermissionCode) =>
  SetMetadata(REQUIRED_PERMISSION, code);

const fromRequest = <T>(
  pick: (request: AuthRequest) => T | undefined,
  what: string,
) =>
  createParamDecorator((_data: unknown, context: ExecutionContext): T => {
    const value = pick(context.switchToHttp().getRequest<AuthRequest>());
    if (value === undefined)
      throw new Error(`${what} is not set; is the route guarded?`);
    return value;
  });

/** The signed-in caller. */
export const CurrentAuth = fromRequest<AuthContext>(
  (r) => r.auth,
  'request.auth',
);

/** The caller's membership in the active clinic. Needs `@ClinicScoped()`. */
export const CurrentMembership = fromRequest<MembershipContext>(
  (r) => r.membership,
  'request.membership',
);

/** The required permission and the caller's scope for it. Needs `@RequirePermission()`. */
export const CurrentAccess = fromRequest<AccessContext>(
  (r) => r.access,
  'request.access',
);

/** The caller's effective permissions in the active clinic. Needs `@RequirePermission()` on the route. */
export const CurrentPermissions = fromRequest<Map<string, PermissionScope>>(
  (r) => r.permissions,
  'request.permissions',
);
