import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthContext } from '../../../common/auth/auth-request.js';
import { workspacePermissions } from '../../../common/auth/workspace-permissions.js';
import { hashPassword, verifyPassword } from '../../../common/auth/password.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  type AccessTokenClaims,
  newRefreshToken,
  REFRESH_TOKEN_TTL_MS,
  sha256,
} from '../../../common/auth/tokens.js';
import { fieldError } from '../../../common/http/errors.js';
import { staffTypesOf } from '../../../common/staff/staff-types.js';
import { describeWorkspaces } from '../../../common/workspace/describe.js';
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
      // Counted in the database, so wrong guesses sent in parallel all count.
      const { failed_login_attempts } = await this.prisma.user.update({
        where: { id: user.id },
        data: { failed_login_attempts: { increment: 1 } },
        select: { failed_login_attempts: true },
      });
      if (failed_login_attempts >= MAX_FAILED_LOGINS) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            failed_login_attempts: 0,
            locked_until: new Date(Date.now() + LOCK_MINUTES * 60_000),
          },
        });
      }
      throw new UnauthorizedException(INVALID_LOGIN);
    }
    if (!user.is_active) throw new UnauthorizedException(INVALID_LOGIN);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failed_login_attempts: 0, locked_until: null },
    });

    const workspaces = (await this.clinicsOf(user.id)).flatMap(
      (c) => c.workspaces,
    );
    const refreshToken = newRefreshToken();
    const session = await this.prisma.authSession.create({
      data: {
        user_id: user.id,
        // With a single workspace there is nothing to choose.
        active_workspace_id: workspaces.length === 1 ? workspaces[0].id : null,
        refresh_token_hash: sha256(refreshToken),
        expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        user_agent: userAgent?.slice(0, 255) ?? null,
      },
    });
    return {
      ...(await this.accessToken(
        user.id,
        session.id,
        session.active_workspace_id,
      )),
      refresh_token: refreshToken,
      me: await this.me({
        user_id: user.id,
        session_id: session.id,
        workspace_id: session.active_workspace_id,
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

    // Only if the token is still the current one: of two refreshes sent with
    // the same token at once, one wins and the other is refused.
    const next = newRefreshToken();
    const { count } = await this.prisma.authSession.updateMany({
      where: { id: session.id, refresh_token_hash: hash, revoked_at: null },
      data: {
        refresh_token_hash: sha256(next),
        previous_token_hash: hash,
        last_used_at: new Date(),
      },
    });
    if (count === 0) {
      throw new UnauthorizedException('The session has ended; sign in again');
    }
    const auth = {
      user_id: session.user_id,
      session_id: session.id,
      workspace_id: session.active_workspace_id,
    };
    return {
      ...(await this.accessToken(
        auth.user_id,
        auth.session_id,
        auth.workspace_id,
      )),
      refresh_token: next,
      me: await this.me(auth),
    };
  }

  /** Makes `workspaceId` the session's active workspace (and so its clinic). */
  async switchWorkspace(
    auth: AuthContext,
    workspaceId: string,
  ): Promise<AccessToken & { me: MeDto }> {
    const usable = (await this.clinicsOf(auth.user_id)).some((c) =>
      c.workspaces.some((w) => w.id === workspaceId),
    );
    if (!usable) {
      throw new ForbiddenException(
        'This workspace is not yours, or it is not active',
      );
    }
    await this.prisma.authSession.update({
      where: { id: auth.session_id },
      data: { active_workspace_id: workspaceId },
    });
    return {
      ...(await this.accessToken(auth.user_id, auth.session_id, workspaceId)),
      me: await this.me({ ...auth, workspace_id: workspaceId }),
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
      throw fieldError(
        'new_password',
        'Choose a password different from the current one',
      );
    }
    const passwordHash = await hashPassword(dto.new_password);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { password_hash: passwordHash, must_change_password: false },
      });
      await tx.authSession.updateMany({
        where: {
          user_id: user.id,
          id: { not: auth.session_id },
          revoked_at: null,
        },
        data: { revoked_at: new Date() },
      });
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
    const clinic = clinics.find((c) =>
      c.workspaces.some((w) => w.id === auth.workspace_id),
    );
    const active = clinic?.workspaces.find((w) => w.id === auth.workspace_id);
    const permissions = active
      ? [...(await workspacePermissions(this.prisma, active))]
      : [];
    return {
      user,
      clinics,
      active_workspace_id: active?.id ?? null,
      active_clinic_id: clinic?.clinic_id ?? null,
      permissions,
    };
  }

  private async accessToken(
    userId: string,
    sessionId: string,
    workspaceId: string | null,
  ): Promise<AccessToken> {
    const claims: AccessTokenClaims = {
      sub: userId,
      sid: sessionId,
      wid: workspaceId,
    };
    return {
      access_token: await this.jwt.signAsync(claims, {
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      }),
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  /**
   * The user's active clinics with their staff types and active workspaces.
   * A clinic where the user has no active workspace is left out: there is
   * nothing they could do in it.
   */
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
    const usable = memberships.filter((m) => clinicName.has(m.clinic_id));
    const ids = usable.map((m) => m.id);
    const [workspaces, typesOf] = await Promise.all([
      this.prisma.workspace.findMany({
        where: { membership_id: { in: ids }, is_active: true },
        orderBy: [{ is_admin: 'desc' }, { created_at: 'asc' }],
      }),
      staffTypesOf(this.prisma, ids),
    ]);
    const described = await describeWorkspaces(this.prisma, workspaces);
    return usable
      .map((m) => ({
        clinic_id: m.clinic_id,
        clinic_name: clinicName.get(m.clinic_id)!,
        membership_id: m.id,
        staff_types: typesOf.get(m.id) ?? [],
        workspaces: described
          .filter(
            (w) => w.membership_id === m.id && w.clinic_id === m.clinic_id,
          )
          .map((w) => ({
            id: w.id,
            kind: w.kind,
            doctor_membership_id: w.doctor_membership_id,
            doctor_name: w.doctor_name,
            relationship_type: w.relationship_type,
            is_admin: w.is_admin,
            label: w.label,
          })),
      }))
      .filter((c) => c.workspaces.length > 0);
  }
}
