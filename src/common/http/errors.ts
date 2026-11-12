import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

/**
 * The errors handlers throw beyond a plain message. Each puts a
 * machine-readable `details` next to the message, which `AllExceptionsFilter`
 * passes through to the response.
 */

/** A 400 in the same shape as a validation error, for one field. */
export function fieldError(field: string, error: string) {
  return new BadRequestException({
    message: 'Validation failed',
    details: [{ field, errors: [error] }],
  });
}

/** A 409 whose `details.reason` lets the app tell conflicts apart. */
export function conflict(
  reason: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return new ConflictException({ message, details: { reason, ...extra } });
}

/** The 403 for a missing permission (`PermissionGuard`, and handlers that check one themselves). */
export const forbidden = (code: string) =>
  new ForbiddenException({
    message: 'You do not have permission for this',
    details: { permission: code },
  });
