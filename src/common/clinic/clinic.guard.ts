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
 * The clinic a request acts for is the session's active clinic (chosen at
 * login or with `POST /auth/switch-clinic`); there is no clinic header. On
 * every request the clinic must still be active and the caller still an
 * active member, so removing a member takes effect at once.
 */
@Injectable()
export class ClinicGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const auth = request.auth;
    if (!auth) throw new UnauthorizedException('Sign in first');
    if (!auth.clinic_id) {
      throw new ConflictException({
        message: 'Choose a clinic first',
        details: { reason: 'clinic_required' },
      });
    }

    const clinic = await this.prisma.clinic.findUnique({
      where: { id: auth.clinic_id },
      select: { is_active: true },
    });
    if (!clinic?.is_active)
      throw new ForbiddenException('The clinic is not active');

    const membership = await this.prisma.clinicMembership.findUnique({
      where: {
        clinic_id_user_id: { clinic_id: auth.clinic_id, user_id: auth.user_id },
      },
      select: { id: true, is_active: true },
    });
    if (!membership?.is_active)
      throw new ForbiddenException('You are not a member of this clinic');

    request.clinic_id = auth.clinic_id;
    request.membership = {
      id: membership.id,
      clinic_id: auth.clinic_id,
      user_id: auth.user_id,
    };
    return true;
  }
}
