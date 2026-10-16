import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';

export interface FieldError {
  /** Dotted path for nested objects and arrays, e.g. `items.0.quantity`. */
  field: string;
  errors: string[];
}

export function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints
      ? [{ field, errors: Object.values(error.constraints) }]
      : [];
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}

/** Request validation for the whole app: unknown fields are rejected. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new BadRequestException({
        message: 'Validation failed',
        details: flattenValidationErrors(errors),
      }),
  });
}
