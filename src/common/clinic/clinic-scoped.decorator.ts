import { applyDecorators, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PermissionGuard } from '../auth/permission.guard.js';
import { ErrorResponseDto } from '../../core/http/error-response.dto.js';
import { WorkspaceGuard } from '../workspace/workspace.guard.js';

/**
 * For controllers whose data belongs to one clinic: the request acts in the
 * session's active workspace (and so its clinic), which must hold each
 * route's `@RequirePermission(...)` item.
 */
export const ClinicScoped = () =>
  applyDecorators(
    UseGuards(WorkspaceGuard, PermissionGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({
      type: ErrorResponseDto,
      description: 'Not signed in, or the session ended',
    }),
    ApiForbiddenResponse({
      type: ErrorResponseDto,
      description:
        'The workspace is not yours or inactive, or lacks the permission',
    }),
    ApiConflictResponse({
      type: ErrorResponseDto,
      description: 'No workspace chosen yet',
    }),
  );
