import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ClinicMembership,
  Prisma,
} from '../../generated/prisma/client.js';
import { audit } from '../../common/audit/audit.js';
import type {
  MembershipContext,
  WorkspaceContext,
} from '../../common/auth/auth-request.js';
import { hashPassword, temporaryPassword } from '../../common/auth/password.js';
import {
  DOCTOR_STAFF_TYPE,
  doctorMembershipIds,
} from '../../common/staff/doctors.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type {
  CreatedStaffMemberDto,
  CreateStaffMemberDto,
  DoctorDto,
  PasswordResetDto,
  SetDoctorProfileDto,
  StaffMemberDto,
  UpdateStaffMemberDto,
} from './dto/staff.dto.js';
import { fieldError, WorkspacesService } from './workspaces.service.js';

/**
 * The people of a clinic: who they are (staff types, doctor profile) and
 * their workspaces. What they may do lives on each workspace.
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspacesService,
  ) {}

  /** Every membership of the clinic (active and inactive), with staff types, workspaces and doctor profile. */
  async list(clinicId: string): Promise<StaffMemberDto[]> {
    const memberships = await this.prisma.clinicMembership.findMany({
      where: { clinic_id: clinicId },
      orderBy: { joined_at: 'asc' },
    });
    return this.describe(clinicId, memberships);
  }

  async get(clinicId: string, membershipId: string): Promise<StaffMemberDto> {
    const [member] = await this.describe(clinicId, [
      await this.membership(clinicId, membershipId),
    ]);
    return member;
  }

  /**
   * Adds someone to the clinic. An existing user (same mobile) is reused;
   * otherwise an account is created with a temporary password. A doctor gets
   * their practice workspace, and each position in `positions` becomes a
   * workspace. All of them start with no permissions.
   */
  async create(
    actor: MembershipContext,
    dto: CreateStaffMemberDto,
  ): Promise<CreatedStaffMemberDto> {
    const staffTypeIds = await this.staffTypeIds(dto.staff_types);

    let user = await this.prisma.user.findUnique({
      where: { mobile: dto.mobile },
    });
    let password: string | null = null;
    if (user) {
      const existing = await this.prisma.clinicMembership.findUnique({
        where: {
          clinic_id_user_id: { clinic_id: actor.clinic_id, user_id: user.id },
        },
      });
      if (existing) {
        throw new ConflictException({
          message: 'This person is already a member of the clinic',
          details: { membership_id: existing.id },
        });
      }
    }

    const membership = await this.prisma.$transaction(async (tx) => {
      if (!user) {
        password = temporaryPassword();
        user = await tx.user.create({
          data: {
            full_name: dto.full_name,
            mobile: dto.mobile,
            password_hash: await hashPassword(password),
            must_change_password: true,
          },
        });
      }
      const created = await tx.clinicMembership.create({
        data: { clinic_id: actor.clinic_id, user_id: user.id },
      });
      await this.replaceStaffTypes(
        tx,
        actor.clinic_id,
        created.id,
        staffTypeIds,
      );
      if (dto.staff_types.includes(DOCTOR_STAFF_TYPE)) {
        await this.workspaces.ensureDoctorWorkspace(
          tx,
          actor.clinic_id,
          created.id,
        );
      }
      for (const position of dto.positions ?? []) {
        await this.workspaces.addPosition(
          tx,
          actor.clinic_id,
          created.id,
          position,
        );
      }
      await audit(tx, actor, {
        action: 'membership.created',
        resource_type: 'membership',
        resource_id: created.id,
        details: {
          mobile: dto.mobile,
          staff_types: dto.staff_types,
          positions: (dto.positions ?? []).map((p) => ({
            kind: p.kind,
            doctor_membership_id: p.doctor_membership_id ?? null,
            relationship_type: p.relationship_type ?? null,
          })),
        },
      });
      return created;
    });
    return Object.assign(await this.get(actor.clinic_id, membership.id), {
      temporary_password: password,
    });
  }

  /**
   * Gives a member a new temporary password and signs them out everywhere.
   * Refused for yourself (use change password) and for people who also
   * belong to another clinic, so one clinic's admin can't take over an
   * account that other clinics rely on.
   */
  async resetPassword(
    actor: MembershipContext,
    membershipId: string,
  ): Promise<PasswordResetDto> {
    const membership = await this.membership(actor.clinic_id, membershipId);
    if (membership.user_id === actor.user_id) {
      throw new ConflictException({
        message: 'Use change password for your own account',
        details: { reason: 'self' },
      });
    }
    const otherClinics = await this.prisma.clinicMembership.count({
      where: {
        user_id: membership.user_id,
        clinic_id: { not: actor.clinic_id },
        is_active: true,
      },
    });
    if (otherClinics > 0) {
      throw new ConflictException({
        message: 'This person is also a member of another clinic',
        details: { reason: 'other_clinics' },
      });
    }

    const password = temporaryPassword();
    const passwordHash = await hashPassword(password);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: membership.user_id },
        data: {
          password_hash: passwordHash,
          must_change_password: true,
          failed_login_attempts: 0,
          locked_until: null,
        },
      });
      await tx.authSession.updateMany({
        where: { user_id: membership.user_id, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      await audit(tx, actor, {
        action: 'staff.password_reset',
        resource_type: 'membership',
        resource_id: membershipId,
      });
    });
    return { temporary_password: password };
  }

  /**
   * Changes active state and staff types. Becoming a doctor adds the practice
   * workspace; no longer being one deactivates it. The clinic always keeps an
   * active admin.
   */
  async update(
    actor: MembershipContext,
    membershipId: string,
    dto: UpdateStaffMemberDto,
  ): Promise<StaffMemberDto> {
    const current = await this.membership(actor.clinic_id, membershipId);
    const staffTypeIds = dto.staff_types
      ? await this.staffTypeIds(dto.staff_types)
      : undefined;
    if (current.is_active && dto.is_active === false) {
      await this.workspaces.assertAdminRemains(actor.clinic_id, {
        membershipId,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.is_active !== undefined) {
        await tx.clinicMembership.update({
          where: { id: membershipId },
          data: { is_active: dto.is_active },
        });
      }
      if (dto.staff_types && staffTypeIds) {
        await this.replaceStaffTypes(
          tx,
          actor.clinic_id,
          membershipId,
          staffTypeIds,
        );
        const isDoctor = dto.staff_types.includes(DOCTOR_STAFF_TYPE);
        if (isDoctor) {
          await this.workspaces.ensureDoctorWorkspace(
            tx,
            actor.clinic_id,
            membershipId,
          );
        }
        await tx.workspace.updateMany({
          where: {
            clinic_id: actor.clinic_id,
            membership_id: membershipId,
            kind: 'doctor',
          },
          data: { is_active: isDoctor },
        });
      }
      await audit(tx, actor, {
        action: 'membership.updated',
        resource_type: 'membership',
        resource_id: membershipId,
        // The DTO is plain data; losing its prototype is intended.
        // oxlint-disable-next-line typescript/no-misused-spread
        details: { ...dto },
      });
    });
    return this.get(actor.clinic_id, membershipId);
  }

  /** Sets the professional details of a member with the doctor staff type. */
  async setDoctorProfile(
    actor: MembershipContext,
    membershipId: string,
    dto: SetDoctorProfileDto,
  ) {
    const membership = await this.membership(actor.clinic_id, membershipId);
    if (
      !(await doctorMembershipIds(this.prisma, actor.clinic_id)).includes(
        membershipId,
      )
    ) {
      throw new BadRequestException(
        'Only an active member with the doctor staff type can have a doctor profile',
      );
    }
    const values = {
      medical_license: dto.medical_license,
      specialty: dto.specialty ?? null,
      license_verified: dto.license_verified ?? false,
    };
    await this.prisma.doctorProfile.upsert({
      where: { user_id: membership.user_id },
      create: { user_id: membership.user_id, ...values },
      update: values,
    });
    await audit(this.prisma, actor, {
      action: 'doctor_profile.updated',
      resource_type: 'membership',
      resource_id: membershipId,
      details: values,
    });
    return this.get(actor.clinic_id, membershipId);
  }

  /**
   * The doctors the workspace can book for: its own doctor, or every active
   * doctor of the clinic for a clinic-wide workspace.
   */
  async doctors(workspace: WorkspaceContext): Promise<DoctorDto[]> {
    const all = await doctorMembershipIds(this.prisma, workspace.clinic_id);
    const ids = workspace.doctor_membership_id
      ? all.filter((id) => id === workspace.doctor_membership_id)
      : all;
    const members = await this.describe(
      workspace.clinic_id,
      await this.prisma.clinicMembership.findMany({
        where: { id: { in: ids } },
      }),
    );
    return members
      .map((m) => ({
        membership_id: m.membership_id,
        full_name: m.full_name,
        specialty: m.doctor_profile?.specialty ?? null,
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'fa'));
  }

  private async membership(
    clinicId: string,
    membershipId: string,
  ): Promise<ClinicMembership> {
    const membership = await this.prisma.clinicMembership.findFirst({
      where: { id: membershipId, clinic_id: clinicId },
    });
    if (!membership) throw new NotFoundException('Member not found');
    return membership;
  }

  private async staffTypeIds(codes: string[]): Promise<string[]> {
    const types = await this.prisma.staffType.findMany({
      where: { code: { in: codes } },
    });
    const missing = codes.filter((code) => !types.some((t) => t.code === code));
    if (missing.length > 0)
      throw fieldError(
        'staff_types',
        `Unknown staff types: ${missing.join(', ')}`,
      );
    return types.map((t) => t.id);
  }

  private async replaceStaffTypes(
    tx: Prisma.TransactionClient,
    clinicId: string,
    membershipId: string,
    staffTypeIds: string[],
  ) {
    await tx.membershipStaffType.deleteMany({
      where: { membership_id: membershipId },
    });
    await tx.membershipStaffType.createMany({
      data: staffTypeIds.map((staff_type_id) => ({
        clinic_id: clinicId,
        membership_id: membershipId,
        staff_type_id,
      })),
    });
  }

  private async describe(
    clinicId: string,
    memberships: ClinicMembership[],
  ): Promise<StaffMemberDto[]> {
    if (memberships.length === 0) return [];
    const ids = memberships.map((m) => m.id);
    const userIds = memberships.map((m) => m.user_id);
    const [users, typeLinks, profiles, workspaces] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, full_name: true, mobile: true },
      }),
      this.prisma.membershipStaffType.findMany({
        where: { membership_id: { in: ids } },
      }),
      this.prisma.doctorProfile.findMany({
        where: { user_id: { in: userIds } },
      }),
      this.workspaces.ofMembers(clinicId, ids),
    ]);
    const types = await this.prisma.staffType.findMany({
      where: { id: { in: typeLinks.map((l) => l.staff_type_id) } },
    });
    const user = new Map(users.map((u) => [u.id, u]));
    const type = new Map(types.map((t) => [t.id, t.code]));
    const profile = new Map(profiles.map((p) => [p.user_id, p]));
    return memberships.map((m) => {
      const staffTypes = typeLinks
        .filter((l) => l.membership_id === m.id)
        .flatMap((l) => type.get(l.staff_type_id) ?? []);
      const doctor = profile.get(m.user_id);
      return {
        membership_id: m.id,
        user_id: m.user_id,
        full_name: user.get(m.user_id)?.full_name ?? '',
        mobile: user.get(m.user_id)?.mobile ?? '',
        is_active: m.is_active,
        joined_at: m.joined_at,
        staff_types: staffTypes,
        workspaces: workspaces.get(m.id) ?? [],
        doctor_profile:
          doctor && staffTypes.includes(DOCTOR_STAFF_TYPE)
            ? {
                medical_license: doctor.medical_license,
                specialty: doctor.specialty,
                license_verified: doctor.license_verified,
              }
            : null,
      };
    });
  }
}
