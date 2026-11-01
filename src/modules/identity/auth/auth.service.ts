import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthContext } from '../../../common/auth/auth-request.js';
import { effectivePermissions } from '../../../common/auth/effective-permissions.js';
import { hashPassword, verifyPassword } from '../../../common/auth/password.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  type AccessTokenClaims,
  newRefreshToken,
  REFRESH_TOKEN_TTL_MS,
  sha256,
} from '../../../common/auth/tokens.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import type { MeClinicDto, MeDto, TokensDto } from './dto/auth-response.dto.js';
import type { ChangePasswordDto, LoginDto } from './dto/auth.dto.js';

/** The token fields of a response (a plain object, not the DTO class). */
export interface AccessToken {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/** Failed logins in a row before the account locks, and for how long. */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

const INVALID_LOGIN = 'Invalid mobile or password';

/** Checked against when the mobile is unknown, so both cases take as long. */
const DUMMY_HASH = hashPassword('not-a-real-password');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(
    dto: LoginDto,
    userAgent: string | undefined,
  ): Promise<TokensDto> {
    const user = await this.prisma.user.findUnique({
      where: { mobile: dto.mobile },
    });
    if (!user) {
      await verifyPassword(await DUMMY_HASH, dto.password);
      throw new UnauthorizedException(INVALID_LOGIN);
    }
    if (user.locked_until && user.locked_until > new Date()) {
      throw new UnauthorizedException({
        message: 'Too many failed attempts; try again later',
        details: {
          reason: 'locked',
          locked_until: user.locked_until.toISOString(),
        },
      });
    }
    if (!(await verifyPassword(user.password_hash, dto.password))) {
      const attempts = user.failed_login_attempts + 1;
      const lock = attempts >= MAX_FAILED_LOGINS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failed_login_attempts: lock ? 0 : attempts,
          locked_until: lock
            ? new Date(Date.now() + LOCK_MINUTES * 60_000)
            : user.locked_until,
        },
      });
      throw new UnauthorizedException(INVALID_LOGIN);
    }
    if (!user.is_active) throw new UnauthorizedException(INVALID_LOGIN);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failed_login_attempts: 0, locked_until: null },
    });

    const clinics = await this.clinicsOf(user.id);
    const refreshToken = newRefreshToken();
    const session = await this.prisma.authSession.create({
      data: {
        user_id: user.id,
        // With a single clinic there is nothing to choose.
        active_clinic_id: clinics.length === 1 ? clinics[0].clinic_id : null,
        refresh_token_hash: sha256(refreshToken),
        expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        user_agent: userAgent?.slice(0, 255) ?? null,
      },
    });
    return {
      ...(await this.accessToken(
        user.id,
        session.id,
        session.active_clinic_id,
      )),
      refresh_token: refreshToken,
      me: await this.me({
        user_id: user.id,
        session_id: session.id,
        clinic_id: session.active_clinic_id,
      }),
    };
  }

  /**
   * Replaces the refresh token and issues a new access token. A refresh token
   * that was already replaced means it was copied: the session is closed.
   */
  async refresh(refreshToken: string): Promise<TokensDto> {
    const hash = sha256(refreshToken);
    const session = await this.prisma.authSession.findUnique({
      where: { refresh_token_hash: hash },
    });
    if (!session) {
      const reused = await this.prisma.authSession.findFirst({
        where: { previous_token_hash: hash },
      });
      if (reused) {
        await this.prisma.authSession.update({
          where: { id: reused.id },
          data: { revoked_at: new Date() },
        });
      }
      throw new UnauthorizedException('The session has ended; sign in again');
    }
    if (session.revoked_at || session.expires_at <= new Date()) {
      throw new UnauthorizedException('The session has ended; sign in again');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: session.user_id },
      select: { is_active: true },
    });
    if (!user?.is_active)
      throw new UnauthorizedException('The account is not active');

    const next = newRefreshToken();
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: {
        refresh_token_hash: sha256(next),
        previous_token_hash: hash,
        last_used_at: new Date(),
      },
    });
    const auth = {
      user_id: session.user_id,
      session_id: session.id,
      clinic_id: session.active_clinic_id,
    };
    return {
      ...(await this.accessToken(
        auth.user_id,
        auth.session_id,
        auth.clinic_id,
      )),
      refresh_token: next,
      me: await this.me(auth),
    };
  }

  /** Makes `clinicId` the session's active clinic. */
  async switchClinic(
    auth: AuthContext,
    clinicId: string,
  ): Promise<AccessToken & { me: MeDto }> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { is_active: true },
    });
    const membership = await this.prisma.clinicMembership.findUnique({
      where: {
        clinic_id_user_id: { clinic_id: clinicId, user_id: auth.user_id },
      },
      select: { is_active: true },
    });
    if (!clinic?.is_active || !membership?.is_active) {
      throw new ForbiddenException(
        'You are not an active member of this clinic',
      );
    }
    await this.prisma.authSession.update({
      where: { id: auth.session_id },
      data: { active_clinic_id: clinicId },
    });
    const next = { ...auth, clinic_id: clinicId };
    return {
      ...(await this.accessToken(auth.user_id, auth.session_id, clinicId)),
      me: await this.me(next),
    };
  }

  async logout(auth: AuthContext): Promise<void> {
    await this.prisma.authSession.update({
      where: { id: auth.session_id },
      data: { revoked_at: new Date() },
    });
  }

  /** Sets a new password and signs out the user's other sessions. */
  async changePassword(
    auth: AuthContext,
    dto: ChangePasswordDto,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: auth.user_id },
    });
    if (
      !user ||
      !(await verifyPassword(user.password_hash, dto.current_password))
    ) {
      throw new UnauthorizedException('The current password is wrong');
    }
    if (dto.current_password === dto.new_password) {
      throw new ForbiddenException(
        'Choose a password different from the current one',
      );
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: await hashPassword(dto.new_password),
        must_change_password: false,
      },
    });
    await this.prisma.authSession.updateMany({
      where: {
        user_id: user.id,
        id: { not: auth.session_id },
        revoked_at: null,
      },
      data: { revoked_at: new Date() },
    });
  }

  async me(auth: AuthContext): Promise<MeDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.user_id },
      select: {
        id: true,
        full_name: true,
        mobile: true,
        must_change_password: true,
      },
    });
    const clinics = await this.clinicsOf(auth.user_id);
    const active = clinics.find((c) => c.clinic_id === auth.clinic_id);
    const permissions = active
      ? [
          ...(await effectivePermissions(this.prisma, {
            id: active.membership_id,
            clinic_id: active.clinic_id,
          })),
        ].map(([code, scope]) => ({ code, scope }))
      : [];
    return {
      user,
      clinics,
      active_clinic_id: active ? active.clinic_id : null,
      permissions,
    };
  }

  private async accessToken(
    userId: string,
    sessionId: string,
    clinicId: string | null,
  ): Promise<AccessToken> {
    const claims: AccessTokenClaims = {
      sub: userId,
      sid: sessionId,
      cid: clinicId,
    };
    return {
      access_token: await this.jwt.signAsync(claims, {
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      }),
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  /** The user's active memberships in active clinics, with their roles and staff types. */
  private async clinicsOf(userId: string): Promise<MeClinicDto[]> {
    const memberships = await this.prisma.clinicMembership.findMany({
      where: { user_id: userId, is_active: true },
      orderBy: { joined_at: 'asc' },
    });
    if (memberships.length === 0) return [];
    const clinics = await this.prisma.clinic.findMany({
      where: {
        id: { in: memberships.map((m) => m.clinic_id) },
        is_active: true,
      },
    });
    const clinicName = new Map(clinics.map((c) => [c.id, c.name]));
    const ids = memberships
      .filter((m) => clinicName.has(m.clinic_id))
      .map((m) => m.id);

    const [roleLinks, typeLinks] = await Promise.all([
      this.prisma.membershipRole.findMany({
        where: { membership_id: { in: ids } },
      }),
      this.prisma.membershipStaffType.findMany({
        where: { membership_id: { in: ids } },
      }),
    ]);
    const [roles, types] = await Promise.all([
      this.prisma.role.findMany({
        where: { id: { in: roleLinks.map((l) => l.role_id) } },
      }),
      this.prisma.staffType.findMany({
        where: { id: { in: typeLinks.map((l) => l.staff_type_id) } },
      }),
    ]);
    const roleById = new Map(roles.map((r) => [r.id, r]));
    const typeById = new Map(types.map((t) => [t.id, t.code]));

    return memberships
      .filter((m) => clinicName.has(m.clinic_id))
      .map((m) => ({
        clinic_id: m.clinic_id,
        clinic_name: clinicName.get(m.clinic_id)!,
        membership_id: m.id,
        roles: roleLinks
          .filter((l) => l.membership_id === m.id)
          .map((l) => roleById.get(l.role_id))
          // A role only counts in its own clinic, or if it is a system role.
          .filter(
            (r) =>
              r !== undefined && (r.is_system || r.clinic_id === m.clinic_id),
          )
          .map((r) => ({
            id: r!.id,
            code: r!.code,
            name: r!.name,
            is_system: r!.is_system,
          })),
        staff_types: typeLinks
          .filter((l) => l.membership_id === m.id)
          .flatMap((l) =>
            typeById.has(l.staff_type_id)
              ? [typeById.get(l.staff_type_id)!]
              : [],
          ),
      }));
  }
}
