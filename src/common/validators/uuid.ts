import { Matches } from 'class-validator';

/** Any UUID version; ids here are v7, which not every validator knows. */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const IsUuid = () =>
  Matches(UUID_PATTERN, { message: '$property must be a UUID' });
