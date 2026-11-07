import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { AuthRequest } from '../auth/auth-request.js';

/**
 * A request acts in the session's active workspace (chosen at login or with
 * `POST /auth/switch-workspace`), and so in that workspace's clinic. On every
 * request the workspace, the membership and the clinic must still be active
 * and the workspace must still be the caller's, so removing a position takes
 * effect at once.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const auth = request.auth;
    if (!auth) throw new UnauthorizedException('Sign in first');
    if (!auth.workspace_id) {
      throw new ConflictException({
        message: 'Choose a workspace first',
        details: { reason: 'workspace_required' },
      });
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: auth.workspace_id },
    });
    const membership = workspace
      ? await this.prisma.clinicMembership.findUnique({
          where: { id: workspace.membership_id },
        })
      : null;
    if (
      !workspace?.is_active ||
      !membership?.is_active ||
      membership.user_id !== auth.user_id
    ) {
      throw new ForbiddenException({
        message: 'This workspace is no longer yours',
        details: { reason: 'workspace_inactive' },
      });
    }
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: workspace.clinic_id },
      select: { is_active: true },
    });
    if (!clinic?.is_active)
      throw new ForbiddenException('The clinic is not active');

    request.clinic_id = workspace.clinic_id;
    request.membership = {
      id: membership.id,
      clinic_id: workspace.clinic_id,
      user_id: auth.user_id,
    };
    request.workspace = {
      id: workspace.id,
      clinic_id: workspace.clinic_id,
      membership_id: workspace.membership_id,
      kind: workspace.kind,
      doctor_membership_id: workspace.doctor_membership_id,
      is_admin: workspace.is_admin,
    };
    return true;
  }
}
