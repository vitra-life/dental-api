import { ValidateIf } from 'class-validator';

/**
 * The field may be left out, but `null` is rejected. For optional fields whose
 * column is not nullable (`@IsOptional()` would let `null` through).
 */
export const IsOptionalNonNull = () =>
  ValidateIf((_object, value) => value !== undefined);
