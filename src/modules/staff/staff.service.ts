import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ClinicMembership,
  Prisma,
} from '../../generated/prisma/client.js';
import type { PermissionScope } from '../../generated/prisma/enums.js';
import { audit } from '../../common/audit/audit.js';
import type { MembershipContext } from '../../common/auth/auth-request.js';
import { grantsBeyond } from '../../common/auth/delegation.js';
import { hashPassword, temporaryPassword } from '../../common/auth/password.js';
import {
  DOCTOR_STAFF_TYPE,
  doctorMembershipIds,
} from '../../common/staff/doctors.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import {
  CLINIC_ADMIN_ROLE,
  SYSTEM_ROLE_OWNER,
} from '../../common/auth/system-roles.js';
import type {
  CreatedStaffMemberDto,
  CreateStaffMemberDto,
  DoctorDto,
  SetDoctorProfileDto,
  StaffMemberDto,
  UpdateStaffMemberDto,
} from './dto/staff.dto.js';

/** A 400 in the same shape as a validation error, for one field. */
function fieldError(field: string, error: string) {
  return new BadRequestException({
    message: 'Validation failed',
    details: [{ field, errors: [error] }],
  });
}

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every membership of the clinic (active and inactive), with user, staff types, roles and doctor profile. */
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
   * otherwise an account is created with a temporary password.
   */
  async create(
    actor: MembershipContext,
    caller: Map<string, PermissionScope>,
    dto: CreateStaffMemberDto,
  ): Promise<CreatedStaffMemberDto> {
    const staffTypeIds = await this.staffTypeIds(dto.staff_types);
    await this.assertRolesGrantable(actor.clinic_id, caller, dto.role_ids);

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
      await this.replaceLinks(
        tx,
        actor.clinic_id,
        created.id,
        staffTypeIds,
        dto.role_ids,
      );
      await audit(tx, actor, {
        action: 'membership.created',
        resource_type: 'membership',
        resource_id: created.id,
        details: {
          mobile: dto.mobile,
          staff_types: dto.staff_types,
          role_ids: dto.role_ids,
        },
      });
      return created;
    });
    return Object.assign(await this.get(actor.clinic_id, membership.id), {
      temporary_password: password,
    });
  }

  /** Changes active state, staff types and roles. The clinic always keeps an active admin. */
  async update(
    actor: MembershipContext,
    caller: Map<string, PermissionScope>,
    membershipId: string,
    dto: UpdateStaffMemberDto,
  ): Promise<StaffMemberDto> {
    const current = await this.membership(actor.clinic_id, membershipId);
    const staffTypeIds = dto.staff_types
      ? await this.staffTypeIds(dto.staff_types)
      : undefined;
    if (dto.role_ids)
      await this.assertRolesGrantable(actor.clinic_id, caller, dto.role_ids);

    const adminRole = await this.clinicAdminRole();
    const isAdminNow = await this.prisma.membershipRole.count({
      where: { membership_id: membershipId, role_id: adminRole.id },
    });
    const staysAdmin = dto.role_ids
      ? dto.role_ids.includes(adminRole.id)
      : isAdminNow > 0;
    const staysActive = dto.is_active ?? current.is_active;
    if (isAdminNow > 0 && current.is_active && (!staysAdmin || !staysActive)) {
      const otherAdmins = await this.activeAdminCount(
        actor.clinic_id,
        adminRole.id,
        membershipId,
      );
      if (otherAdmins === 0) {
        throw new ConflictException({
          message: 'The clinic needs at least one active clinic admin',
          details: { reason: 'last_admin' },
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.is_active !== undefined) {
        await tx.clinicMembership.update({
          where: { id: membershipId },
          data: { is_active: dto.is_active },
        });
      }
      await this.replaceLinks(
        tx,
        actor.clinic_id,
        membershipId,
        staffTypeIds,
        dto.role_ids,
      );
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

  /** Active doctors of the clinic, for booking. */
  async doctors(clinicId: string): Promise<DoctorDto[]> {
    const ids = await doctorMembershipIds(this.prisma, clinicId);
    const members = await this.describe(
      clinicId,
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

  /**
   * The roles must be system roles or this clinic's own (this replaces the
   * design's trigger), and the caller may only hand out roles whose grants
   * they hold themselves.
   */
  private async assertRolesGrantable(
    clinicId: string,
    caller: Map<string, PermissionScope>,
    roleIds: string[],
  ) {
    if (roleIds.length === 0) return;
    const roles = await this.prisma.role.findMany({
      where: {
        id: { in: roleIds },
        OR: [{ is_system: true, clinic_id: null }, { clinic_id: clinicId }],
      },
      select: { id: true },
    });
    const missing = roleIds.filter((id) => !roles.some((r) => r.id === id));
    if (missing.length > 0)
      throw fieldError(
        'role_ids',
        'Each role must be a system role or one of this clinic',
      );

    const grants = await this.prisma.rolePermission.findMany({
      where: { role_id: { in: roleIds } },
    });
    const permissions = await this.prisma.permission.findMany({
      where: {
        id: { in: [...new Set(grants.map((g) => g.permission_id))] },
        is_assignable: true,
      },
      select: { id: true, code: true },
    });
    const code = new Map(permissions.map((p) => [p.id, p.code]));
    const beyond = grantsBeyond(
      caller,
      grants.flatMap((g) =>
        code.has(g.permission_id)
          ? [{ code: code.get(g.permission_id)!, scope: g.scope }]
          : [],
      ),
    );
    if (beyond.length > 0) {
      throw new ForbiddenException({
        message: 'You can only give roles whose permissions you hold yourself',
        details: { permissions: beyond },
      });
    }
  }

  private async replaceLinks(
    tx: Prisma.TransactionClient,
    clinicId: string,
    membershipId: string,
    staffTypeIds: string[] | undefined,
    roleIds: string[] | undefined,
  ) {
    if (staffTypeIds) {
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
    if (roleIds) {
      await tx.membershipRole.deleteMany({
        where: { membership_id: membershipId },
      });
      await tx.membershipRole.createMany({
        data: roleIds.map((role_id) => ({
          clinic_id: clinicId,
          membership_id: membershipId,
          role_id,
        })),
      });
    }
  }

  private async clinicAdminRole() {
    return this.prisma.role.findUniqueOrThrow({
      where: {
        owner_key_code: {
          owner_key: SYSTEM_ROLE_OWNER,
          code: CLINIC_ADMIN_ROLE,
        },
      },
    });
  }

  /** Active memberships of the clinic, other than `exceptId`, that hold the admin role. */
  private async activeAdminCount(
    clinicId: string,
    adminRoleId: string,
    exceptId: string,
  ): Promise<number> {
    const links = await this.prisma.membershipRole.findMany({
      where: {
        clinic_id: clinicId,
        role_id: adminRoleId,
        membership_id: { not: exceptId },
      },
      select: { membership_id: true },
    });
    return this.prisma.clinicMembership.count({
      where: { id: { in: links.map((l) => l.membership_id) }, is_active: true },
    });
  }

  private async describe(
    clinicId: string,
    memberships: ClinicMembership[],
  ): Promise<StaffMemberDto[]> {
    if (memberships.length === 0) return [];
    const ids = memberships.map((m) => m.id);
    const userIds = memberships.map((m) => m.user_id);
    const [users, typeLinks, roleLinks, profiles] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, full_name: true, mobile: true },
      }),
      this.prisma.membershipStaffType.findMany({
        where: { membership_id: { in: ids } },
      }),
      this.prisma.membershipRole.findMany({
        where: { membership_id: { in: ids } },
      }),
      this.prisma.doctorProfile.findMany({
        where: { user_id: { in: userIds } },
      }),
    ]);
    const [types, roles] = await Promise.all([
      this.prisma.staffType.findMany({
        where: { id: { in: typeLinks.map((l) => l.staff_type_id) } },
      }),
      this.prisma.role.findMany({
        where: { id: { in: roleLinks.map((l) => l.role_id) } },
      }),
    ]);
    const user = new Map(users.map((u) => [u.id, u]));
    const type = new Map(types.map((t) => [t.id, t.code]));
    const role = new Map(roles.map((r) => [r.id, r]));
    const profile = new Map(profiles.map((p) => [p.user_id, p]));

    return memberships.map((m) => {
      const staffTypes = typeLinks
        .filter((l) => l.membership_id === m.id)
        .flatMap((l) =>
          type.has(l.staff_type_id) ? [type.get(l.staff_type_id)!] : [],
        );
      const doctor = profile.get(m.user_id);
      return {
        membership_id: m.id,
        user_id: m.user_id,
        full_name: user.get(m.user_id)?.full_name ?? '',
        mobile: user.get(m.user_id)?.mobile ?? '',
        is_active: m.is_active,
        joined_at: m.joined_at,
        staff_types: staffTypes,
        roles: roleLinks
          .filter((l) => l.membership_id === m.id)
          .map((l) => role.get(l.role_id))
          .filter(
            (r) => r !== undefined && (r.is_system || r.clinic_id === clinicId),
          )
          .map((r) => ({
            id: r!.id,
            code: r!.code,
            name: r!.name,
            is_system: r!.is_system,
          })),
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
