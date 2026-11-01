import type { PermissionScope } from '../../generated/prisma/enums.js';
import { catalogItem } from './permission-catalog.js';
import { scopeCovers } from './effective-permissions.js';

export interface Grant {
  code: string;
  scope: PermissionScope;
}

/**
 * Items of `grants` the caller may not hand out: one they don't hold, or at a
 * wider scope than they hold it. Empty means the grant is allowed.
 */
export function grantsBeyond(
  caller: Map<string, PermissionScope>,
  grants: Grant[],
): Grant[] {
  return grants.filter((grant) => {
    const held = caller.get(grant.code);
    const scoped = catalogItem(grant.code)?.scoped ?? false;
    return !held || (scoped && !scopeCovers(held, grant.scope));
  });
}

/** Scope only matters for data items; others are stored as `clinic`. */
export const normaliseScope = (grant: Grant): Grant =>
  catalogItem(grant.code)?.scoped
    ? grant
    : { code: grant.code, scope: 'clinic' };
