import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { AuthRequest } from './auth-request.js';
import { ALLOW_TEMPORARY_PASSWORD, IS_PUBLIC } from './decorators.js';
import type { AccessTokenClaims } from './tokens.js';

/**
 * Global guard: every route needs a valid access token unless marked
 * `@Public()`. The token's session must still be open and its user active,
 * so logging out or deactivating a user takes effect at once.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets))
      return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer '))
      throw new UnauthorizedException('Sign in first');

    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(
        header.slice('Bearer '.length),
      );
    } catch {
      throw new UnauthorizedException(
        'The access token is invalid or has expired',
      );
    }

    const session = await this.prisma.authSession.findUnique({
      where: { id: claims.sid },
      select: {
        user_id: true,
        active_clinic_id: true,
        revoked_at: true,
        expires_at: true,
      },
    });
    if (
      !session ||
      session.revoked_at ||
      session.expires_at <= new Date() ||
      session.user_id !== claims.sub
    ) {
      throw new UnauthorizedException('The session has ended; sign in again');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: { is_active: true, must_change_password: true },
    });
    if (!user?.is_active)
      throw new UnauthorizedException('The account is not active');

    if (
      user.must_change_password &&
      !this.reflector.getAllAndOverride<boolean>(
        ALLOW_TEMPORARY_PASSWORD,
        targets,
      )
    ) {
      throw new ForbiddenException({
        message: 'Change your temporary password first',
        details: { reason: 'password_change_required' },
      });
    }

    // The session, not the token, says which clinic is active: switching
    // clinics updates the session.
    request.auth = {
      user_id: claims.sub,
      session_id: claims.sid,
      clinic_id: session.active_clinic_id,
    };
    return true;
  }
}
