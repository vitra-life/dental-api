import { applyDecorators, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PermissionGuard } from '../auth/permission.guard.js';
import { ErrorResponseDto } from '../../core/http/error-response.dto.js';
import { ClinicGuard } from './clinic.guard.js';

/**
 * For controllers whose data belongs to one clinic: the caller must be an
 * active member of the session's active clinic, and hold each route's
 * `@RequirePermission(...)` item.
 */
export const ClinicScoped = () =>
  applyDecorators(
    UseGuards(ClinicGuard, PermissionGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({
      type: ErrorResponseDto,
      description: 'Not signed in, or the session ended',
    }),
    ApiForbiddenResponse({
      type: ErrorResponseDto,
      description: 'Not a member, or missing the permission',
    }),
    ApiConflictResponse({
      type: ErrorResponseDto,
      description: 'No active clinic chosen yet',
    }),
  );
