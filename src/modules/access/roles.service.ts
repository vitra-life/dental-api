import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Role } from '../../generated/prisma/client.js';
import type { PermissionScope } from '../../generated/prisma/enums.js';
import { audit } from '../../common/audit/audit.js';
import type { MembershipContext } from '../../common/auth/auth-request.js';
import { grantsBeyond, normaliseScope } from '../../common/auth/delegation.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type {
  CreateRoleDto,
  RoleDto,
  RoleGrantDto,
  UpdateRoleDto,
} from './dto/role.dto.js';
import { SYSTEM_ROLE_OWNER } from '../../common/auth/system-roles.js';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The system roles and the clinic's own roles, with their grants and member counts. */
  async list(clinicId: string): Promise<RoleDto[]> {
    const roles = await this.prisma.role.findMany({
      where: {
        OR: [{ is_system: true, clinic_id: null }, { clinic_id: clinicId }],
      },
      orderBy: [{ is_system: 'desc' }, { name: 'asc' }],
    });
    return this.describe(clinicId, roles);
  }

  async get(clinicId: string, id: string): Promise<RoleDto> {
    const [role] = await this.describe(clinicId, [
      await this.find(clinicId, id),
    ]);
    return role;
  }

  async create(
    member: MembershipContext,
    dto: CreateRoleDto,
  ): Promise<RoleDto> {
    const role = await this.prisma.role.create({
      data: {
        clinic_id: member.clinic_id,
        owner_key: member.clinic_id,
        code: dto.code,
        name: dto.name,
        is_system: false,
      },
    });
    await audit(this.prisma, member, {
      action: 'role.created',
      resource_type: 'role',
      resource_id: role.id,
      details: { code: role.code, name: role.name },
    });
    return this.get(member.clinic_id, role.id);
  }

  async update(
    member: MembershipContext,
    id: string,
    dto: UpdateRoleDto,
  ): Promise<RoleDto> {
    const role = await this.editable(member.clinic_id, id);
    await this.prisma.role.update({ where: { id }, data: { name: dto.name } });
    await audit(this.prisma, member, {
      action: 'role.updated',
      resource_type: 'role',
      resource_id: id,
      details: { before: { name: role.name }, after: { name: dto.name } },
    });
    return this.get(member.clinic_id, id);
  }

  /** Deletes a custom role that nobody holds. */
  async remove(member: MembershipContext, id: string): Promise<void> {
    const role = await this.editable(member.clinic_id, id);
    const holders = await this.prisma.membershipRole.count({
      where: { role_id: id },
    });
    if (holders > 0)
      throw new ConflictException(
        'The role is assigned to members; remove it from them first',
      );
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { role_id: id } }),
      this.prisma.role.delete({ where: { id } }),
    ]);
    await audit(this.prisma, member, {
      action: 'role.deleted',
      resource_type: 'role',
      resource_id: id,
      details: { code: role.code },
    });
  }

  /**
   * Replaces a custom role's grants. The caller can only hand out items they
   * hold, at a scope no wider than their own.
   */
  async setPermissions(
    member: MembershipContext,
    caller: Map<string, PermissionScope>,
    id: string,
    grants: RoleGrantDto[],
  ): Promise<RoleDto> {
    await this.editable(member.clinic_id, id);
    const wanted = [
      ...new Map(grants.map((g) => [g.code, normaliseScope(g)])).values(),
    ];

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: wanted.map((g) => g.code) }, is_assignable: true },
      select: { id: true, code: true },
    });
    const idOf = new Map(permissions.map((p) => [p.code, p.id]));
    const unknown = wanted.filter((g) => !idOf.has(g.code)).map((g) => g.code);
    if (unknown.length > 0) {
      throw new BadRequestException({
        message: 'Unknown permission codes',
        details: { codes: unknown },
      });
    }
    const beyond = grantsBeyond(caller, wanted);
    if (beyond.length > 0) {
      throw new ForbiddenException({
        message:
          'You can only grant permissions you hold, at your own scope or narrower',
        details: { permissions: beyond },
      });
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { role_id: id } }),
      this.prisma.rolePermission.createMany({
        data: wanted.map((g) => ({
          role_id: id,
          permission_id: idOf.get(g.code)!,
          scope: g.scope,
        })),
      }),
    ]);
    await audit(this.prisma, member, {
      action: 'permission.assigned',
      resource_type: 'role',
      resource_id: id,
      details: {
        permissions: wanted.map((g) => ({ code: g.code, scope: g.scope })),
      },
    });
    return this.get(member.clinic_id, id);
  }

  /** A role usable in the clinic: a system role or one of its own. */
  private async find(clinicId: string, id: string): Promise<Role> {
    const role = await this.prisma.role.findFirst({
      where: {
        id,
        OR: [{ is_system: true, clinic_id: null }, { clinic_id: clinicId }],
      },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  /** A role the clinic may change: its own, never a system role. */
  private async editable(clinicId: string, id: string): Promise<Role> {
    const role = await this.find(clinicId, id);
    if (role.is_system || role.owner_key === SYSTEM_ROLE_OWNER) {
      throw new ForbiddenException('System roles cannot be changed');
    }
    return role;
  }

  private async describe(clinicId: string, roles: Role[]): Promise<RoleDto[]> {
    if (roles.length === 0) return [];
    const ids = roles.map((r) => r.id);
    const [grants, holders] = await Promise.all([
      this.prisma.rolePermission.findMany({ where: { role_id: { in: ids } } }),
      this.prisma.membershipRole.groupBy({
        by: ['role_id'],
        where: { role_id: { in: ids }, clinic_id: clinicId },
        _count: { _all: true },
      }),
    ]);
    const permissions = await this.prisma.permission.findMany({
      where: { id: { in: [...new Set(grants.map((g) => g.permission_id))] } },
      select: { id: true, code: true, sort_order: true },
    });
    const permission = new Map(permissions.map((p) => [p.id, p]));
    const count = new Map(holders.map((h) => [h.role_id, h._count._all]));
    return roles.map((role) => ({
      id: role.id,
      clinic_id: role.clinic_id,
      code: role.code,
      name: role.name,
      is_system: role.is_system,
      member_count: count.get(role.id) ?? 0,
      permissions: grants
        .filter((g) => g.role_id === role.id && permission.has(g.permission_id))
        .sort(
          (a, b) =>
            permission.get(a.permission_id)!.sort_order -
            permission.get(b.permission_id)!.sort_order,
        )
        .map((g) => ({
          code: permission.get(g.permission_id)!.code,
          scope: g.scope,
        })),
    }));
  }
}
