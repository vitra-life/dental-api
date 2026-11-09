import { BadRequestException } from '@nestjs/common';

/** A 400 in the same shape as a validation error, for one field. */
export function fieldError(field: string, error: string) {
  return new BadRequestException({
    message: 'Validation failed',
    details: [{ field, errors: [error] }],
  });
}
