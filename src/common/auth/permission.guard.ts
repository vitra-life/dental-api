import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { AuthRequest } from './auth-request.js';
import { REQUIRED_PERMISSION } from './decorators.js';
import { effectivePermissions } from './effective-permissions.js';

/**
 * Checks `@RequirePermission(code)` against the caller's effective permissions
 * in the active clinic, and passes the scope they hold it at to the handler
 * (`@CurrentAccess()`). Runs after `ClinicGuard`.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const code = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRED_PERMISSION,
      [context.getHandler(), context.getClass()],
    );
    if (!code) return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (!request.membership)
      throw new Error('PermissionGuard needs ClinicGuard to run first');
    request.permissions ??= await effectivePermissions(
      this.prisma,
      request.membership,
    );

    const scope = request.permissions.get(code);
    if (!scope) {
      throw new ForbiddenException({
        message: 'You do not have permission for this',
        details: { permission: code },
      });
    }
    request.access = { code, scope };
    return true;
  }
}
