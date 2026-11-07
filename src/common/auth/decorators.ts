import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type {
  AuthContext,
  AuthRequest,
  MembershipContext,
  WorkspaceContext,
} from './auth-request.js';
import type { PermissionCode } from './permission-catalog.js';

export const IS_PUBLIC = 'auth:public';
export const ALLOW_TEMPORARY_PASSWORD = 'auth:allow-temporary-password';
export const REQUIRED_PERMISSION = 'auth:required-permission';

/** No login needed (login, refresh, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Reachable while the user still has a temporary password (me, change-password, logout). */
export const AllowTemporaryPassword = () =>
  SetMetadata(ALLOW_TEMPORARY_PASSWORD, true);

/**
 * The catalogue item the active workspace must hold. With several codes, any
 * one of them is enough (e.g. the status endpoint, which checks the exact
 * item for the target status itself).
 */
export const RequirePermission = (...codes: PermissionCode[]) =>
  SetMetadata(REQUIRED_PERMISSION, codes);

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

/** The active workspace. Needs `@ClinicScoped()`. */
export const CurrentWorkspace = fromRequest<WorkspaceContext>(
  (r) => r.workspace,
  'request.workspace',
);

/** The active workspace's permission codes. Needs `@RequirePermission()` on the route. */
export const CurrentPermissions = fromRequest<ReadonlySet<string>>(
  (r) => r.permissions,
  'request.permissions',
);
