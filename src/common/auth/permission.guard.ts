import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { forbidden } from '../http/errors.js';
import type { AuthRequest } from './auth-request.js';
import { REQUIRED_PERMISSION } from './decorators.js';
import { workspacePermissions } from './workspace-permissions.js';

/**
 * Checks `@RequirePermission(...)` against the active workspace's grants and
 * leaves them on the request (`@CurrentPermissions()`). Runs after
 * `WorkspaceGuard`.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const codes = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRED_PERMISSION,
      [context.getHandler(), context.getClass()],
    );
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (!request.workspace)
      throw new Error('PermissionGuard needs WorkspaceGuard to run first');
    request.permissions ??= await workspacePermissions(
      this.prisma,
      request.workspace,
    );
    if (!codes?.length) return true;

    if (!codes.some((code) => request.permissions!.has(code))) {
      throw forbidden(codes[0]);
    }
    return true;
  }
}
