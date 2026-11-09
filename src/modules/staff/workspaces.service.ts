import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, Workspace } from '../../generated/prisma/client.js';
import { audit } from '../../common/audit/audit.js';
import type {
  MembershipContext,
  WorkspaceContext,
} from '../../common/auth/auth-request.js';
import {
  codesOf,
  grantablePermissionIds,
  orderedCodes,
} from '../../common/auth/grants.js';
import { CATALOG_CODES } from '../../common/auth/permission-catalog.js';
import { isActiveDoctor, memberNames } from '../../common/staff/doctors.js';
import { describeWorkspaces } from '../../common/workspace/describe.js';
import { conflict, fieldError } from '../../common/http/errors.js';
import type { Db } from '../../core/prisma/db.js';
import { lockClinic } from '../../core/prisma/locks.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { TemplatesService } from '../access/templates.service.js';
import type {
  CreateWorkspaceDto,
  NewPositionDto,
  UpdateWorkspaceDto,
  WorkspaceDto,
} from './dto/staff.dto.js';

const LAST_ADMIN = () =>
  conflict(
    'last_admin',
    'The clinic needs at least one active admin workspace',
  );

/**
 * Workspaces: one person's positions in the clinic. Each starts with no
 * permissions (an admin workspace holds all). The clinic always keeps one
 * active admin workspace held by an active member.
 */
@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplatesService,
  ) {}

  /** Every workspace of the clinic, admins first. */
  async list(clinicId: string): Promise<WorkspaceDto[]> {
    const workspaces = await this.prisma.workspace.findMany({
      where: { clinic_id: clinicId },
      orderBy: [{ is_admin: 'desc' }, { created_at: 'asc' }],
    });
    return this.describe(workspaces);
  }

  async get(clinicId: string, id: string): Promise<WorkspaceDto> {
    const [workspace] = await this.describe([await this.find(clinicId, id)]);
    return workspace;
  }

  /** The workspaces of several members, keyed by membership id. */
  async ofMembers(
    clinicId: string,
    membershipIds: string[],
  ): Promise<Map<string, WorkspaceDto[]>> {
    const workspaces = await this.prisma.workspace.findMany({
      where: { clinic_id: clinicId, membership_id: { in: membershipIds } },
      orderBy: [{ is_admin: 'desc' }, { created_at: 'asc' }],
    });
    const described = await this.describe(workspaces);
    const byMember = new Map<string, WorkspaceDto[]>();
    for (const w of described) {
      byMember.set(w.membership_id, [
        ...(byMember.get(w.membership_id) ?? []),
        w,
      ]);
    }
    return byMember;
  }

  /** Adds a position for a member of the clinic. It starts with no permissions. */
  async create(
    actor: MembershipContext,
    actorWorkspace: WorkspaceContext,
    dto: CreateWorkspaceDto,
  ): Promise<WorkspaceDto> {
    const membership = await this.prisma.clinicMembership.findFirst({
      where: { id: dto.membership_id, clinic_id: actor.clinic_id },
    });
    if (!membership)
      throw fieldError('membership_id', 'Not a member of this clinic');
    if (dto.is_admin) {
      if (dto.kind !== 'clinic')
        throw fieldError(
          'is_admin',
          'Only a clinic-wide workspace can be an admin one',
        );
      if (!actorWorkspace.is_admin)
        throw new ForbiddenException(
          'Only an admin can create an admin workspace',
        );
    }
    const workspace = await this.prisma.$transaction(async (tx) => {
      const created = await this.addPosition(
        tx,
        actor.clinic_id,
        membership.id,
        dto,
        dto.is_admin ?? false,
      );
      await audit(tx, actor, {
        action: 'workspace.created',
        resource_type: 'workspace',
        resource_id: created.id,
        details: {
          membership_id: membership.id,
          kind: created.kind,
          doctor_membership_id: created.doctor_membership_id,
          is_admin: created.is_admin,
        },
      });
      return created;
    });
    return this.get(actor.clinic_id, workspace.id);
  }

  /** Activates, deactivates, or (for admins) makes a clinic-wide workspace admin. */
  async update(
    actor: MembershipContext,
    actorWorkspace: WorkspaceContext,
    id: string,
    dto: UpdateWorkspaceDto,
  ): Promise<WorkspaceDto> {
    const workspace = await this.find(actor.clinic_id, id);
    if (dto.is_admin !== undefined && dto.is_admin !== workspace.is_admin) {
      if (!actorWorkspace.is_admin)
        throw new ForbiddenException(
          'Only an admin can change admin workspaces',
        );
      if (workspace.kind !== 'clinic')
        throw fieldError(
          'is_admin',
          'Only a clinic-wide workspace can be an admin one',
        );
    }
    const staysAdmin =
      (dto.is_admin ?? workspace.is_admin) &&
      (dto.is_active ?? workspace.is_active);
    await this.prisma.$transaction(async (tx) => {
      if (workspace.is_admin && workspace.is_active && !staysAdmin) {
        await this.assertAdminRemains(tx, actor.clinic_id, {
          workspaceId: id,
        });
      }
      await tx.workspace.update({
        where: { id, clinic_id: actor.clinic_id },
        data: { is_active: dto.is_active, is_admin: dto.is_admin },
      });
      await audit(tx, actor, {
        action: 'workspace.updated',
        resource_type: 'workspace',
        resource_id: id,
        // The DTO is plain data; losing its prototype is intended.
        // oxlint-disable-next-line typescript/no-misused-spread
        details: { ...dto },
      });
    });
    return this.get(actor.clinic_id, id);
  }

  /** Removes a position and its grants. Sessions working in it stop at once. */
  async remove(actor: MembershipContext, id: string): Promise<void> {
    const workspace = await this.find(actor.clinic_id, id);
    await this.prisma.$transaction(async (tx) => {
      if (workspace.is_admin && workspace.is_active) {
        await this.assertAdminRemains(tx, actor.clinic_id, {
          workspaceId: id,
        });
      }
      await tx.workspacePermission.deleteMany({ where: { workspace_id: id } });
      await tx.workspace.delete({
        where: { id, clinic_id: actor.clinic_id },
      });
      await audit(tx, actor, {
        action: 'workspace.deleted',
        resource_type: 'workspace',
        resource_id: id,
        details: {
          membership_id: workspace.membership_id,
          kind: workspace.kind,
          doctor_membership_id: workspace.doctor_membership_id,
        },
      });
    });
  }

  /**
   * Replaces a workspace's grants with `codes`. Only items the caller holds
   * can be granted. An admin workspace holds everything, so it has none.
   */
  async setPermissions(
    actor: MembershipContext,
    caller: ReadonlySet<string>,
    id: string,
    codes: string[],
  ): Promise<WorkspaceDto> {
    const workspace = await this.find(actor.clinic_id, id);
    if (workspace.is_admin)
      throw conflict(
        'admin_workspace',
        'An admin workspace already holds every permission',
      );
    const idOf = await grantablePermissionIds(this.prisma, caller, codes);
    await this.prisma.$transaction(async (tx) => {
      await tx.workspacePermission.deleteMany({ where: { workspace_id: id } });
      await tx.workspacePermission.createMany({
        data: [...idOf.values()].map((permission_id) => ({
          clinic_id: actor.clinic_id,
          workspace_id: id,
          permission_id,
        })),
      });
      await audit(tx, actor, {
        action: 'workspace.permissions_set',
        resource_type: 'workspace',
        resource_id: id,
        details: { permissions: [...idOf.keys()] },
      });
    });
    return this.get(actor.clinic_id, id);
  }

  /** Adds a template's items to the workspace's grants (a copy: later template edits don't apply). */
  async applyTemplate(
    actor: MembershipContext,
    caller: ReadonlySet<string>,
    id: string,
    templateId: string,
  ): Promise<WorkspaceDto> {
    const current = await this.get(actor.clinic_id, id);
    await this.templates.find(actor.clinic_id, templateId);
    const codes = await this.templates.codes(templateId);
    return this.setPermissions(actor, caller, id, [
      ...new Set([...current.permissions, ...codes]),
    ]);
  }

  /**
   * Creates a staff or clinic-wide position for `membershipId`, after
   * checking the doctor and relationship type and that it doesn't exist yet.
   */
  async addPosition(
    db: Db,
    clinicId: string,
    membershipId: string,
    position: NewPositionDto,
    isAdmin = false,
  ): Promise<Workspace> {
    if (position.kind === 'clinic') {
      const duplicate = await db.workspace.findFirst({
        where: {
          clinic_id: clinicId,
          membership_id: membershipId,
          kind: 'clinic',
          is_admin: isAdmin,
        },
      });
      if (duplicate) throw duplicateWorkspace();
      return db.workspace.create({
        data: {
          clinic_id: clinicId,
          membership_id: membershipId,
          kind: 'clinic',
          is_admin: isAdmin,
        },
      });
    }

    if (!position.doctor_membership_id)
      throw fieldError(
        'doctor_membership_id',
        'A staff position needs its doctor',
      );
    if (!position.relationship_type)
      throw fieldError(
        'relationship_type',
        'A staff position needs a relationship type',
      );
    if (position.doctor_membership_id === membershipId)
      throw fieldError(
        'doctor_membership_id',
        'Someone cannot be staff of themself',
      );
    if (!(await isActiveDoctor(db, clinicId, position.doctor_membership_id)))
      throw fieldError(
        'doctor_membership_id',
        'Not an active doctor of this clinic',
      );
    const type = await db.relationshipType.findUnique({
      where: { code: position.relationship_type },
    });
    if (!type)
      throw fieldError('relationship_type', 'Unknown relationship type');
    const duplicate = await db.workspace.findFirst({
      where: {
        clinic_id: clinicId,
        membership_id: membershipId,
        kind: 'staff',
        doctor_membership_id: position.doctor_membership_id,
        relationship_type_id: type.id,
      },
    });
    if (duplicate) throw duplicateWorkspace();
    return db.workspace.create({
      data: {
        clinic_id: clinicId,
        membership_id: membershipId,
        kind: 'staff',
        doctor_membership_id: position.doctor_membership_id,
        relationship_type_id: type.id,
      },
    });
  }

  /**
   * 409 `last_admin` unless the clinic keeps another active admin workspace
   * held by an active member, apart from `except`. Locks the clinic, so it
   * must be the first statement of the transaction that then removes the
   * admin: two admins removing each other at once can't both pass.
   */
  async assertAdminRemains(
    tx: Prisma.TransactionClient,
    clinicId: string,
    except: { workspaceId?: string; membershipId?: string },
  ): Promise<void> {
    await lockClinic(tx, clinicId);
    const admins = await tx.workspace.findMany({
      where: {
        clinic_id: clinicId,
        is_admin: true,
        is_active: true,
        ...(except.workspaceId ? { id: { not: except.workspaceId } } : {}),
        ...(except.membershipId
          ? { membership_id: { not: except.membershipId } }
          : {}),
      },
      select: { membership_id: true },
    });
    const activeHolders = await tx.clinicMembership.count({
      where: {
        id: { in: admins.map((a) => a.membership_id) },
        is_active: true,
      },
    });
    if (activeHolders === 0) throw LAST_ADMIN();
  }

  async find(clinicId: string, id: string): Promise<Workspace> {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id, clinic_id: clinicId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace;
  }

  private async describe(workspaces: Workspace[]): Promise<WorkspaceDto[]> {
    if (workspaces.length === 0) return [];
    const [summaries, names, grants] = await Promise.all([
      describeWorkspaces(this.prisma, workspaces),
      memberNames(
        this.prisma,
        workspaces.map((w) => w.membership_id),
      ),
      this.prisma.workspacePermission.findMany({
        where: { workspace_id: { in: workspaces.map((w) => w.id) } },
        select: { workspace_id: true, permission_id: true },
      }),
    ]);
    const code = await codesOf(
      this.prisma,
      grants.map((g) => g.permission_id),
    );
    return summaries.map((w) => ({
      ...w,
      member_name: names.get(w.membership_id) ?? '',
      permissions: w.is_admin
        ? [...CATALOG_CODES]
        : orderedCodes(
            grants
              .filter((g) => g.workspace_id === w.id)
              .map((g) => g.permission_id),
            code,
          ),
    }));
  }
}

const duplicateWorkspace = () =>
  conflict('duplicate_workspace', 'This person already holds this position');
