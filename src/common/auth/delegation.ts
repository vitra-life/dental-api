/**
 * Codes of `wanted` the caller may not hand out (to a workspace or a
 * template): anyone can only grant what they hold themselves. Empty means
 * the grant is allowed.
 */
export const grantsBeyond = (
  caller: ReadonlySet<string>,
  wanted: readonly string[],
): string[] => wanted.filter((code) => !caller.has(code));
