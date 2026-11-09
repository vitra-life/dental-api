import { Injectable, NotFoundException } from '@nestjs/common';
import type { PermissionTemplate } from '../../generated/prisma/client.js';
import { audit } from '../../common/audit/audit.js';
import type { MembershipContext } from '../../common/auth/auth-request.js';
import { codesOf, grantablePermissionIds } from '../../common/auth/grants.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type {
  CreatePermissionTemplateDto,
  PermissionTemplateDto,
  UpdatePermissionTemplateDto,
} from './dto/template.dto.js';

/**
 * A clinic's reusable permission sets. Applying one to a workspace copies its
 * items (see WorkspacesService.applyTemplate); editing it later doesn't change
 * the workspaces it was applied to, so a template can be deleted at any time.
 */
@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(clinicId: string): Promise<PermissionTemplateDto[]> {
    const templates = await this.prisma.permissionTemplate.findMany({
      where: { clinic_id: clinicId },
      orderBy: { name: 'asc' },
    });
    return this.describe(templates);
  }

  async get(clinicId: string, id: string): Promise<PermissionTemplateDto> {
    const [template] = await this.describe([await this.find(clinicId, id)]);
    return template;
  }

  async create(
    member: MembershipContext,
    dto: CreatePermissionTemplateDto,
  ): Promise<PermissionTemplateDto> {
    const template = await this.prisma.$transaction(async (tx) => {
      const created = await tx.permissionTemplate.create({
        data: { clinic_id: member.clinic_id, code: dto.code, name: dto.name },
      });
      await audit(tx, member, {
        action: 'template.created',
        resource_type: 'permission_template',
        resource_id: created.id,
        details: { code: created.code, name: created.name },
      });
      return created;
    });
    return this.get(member.clinic_id, template.id);
  }

  async update(
    member: MembershipContext,
    id: string,
    dto: UpdatePermissionTemplateDto,
  ): Promise<PermissionTemplateDto> {
    const template = await this.find(member.clinic_id, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.permissionTemplate.update({
        where: { id, clinic_id: member.clinic_id },
        data: { name: dto.name },
      });
      await audit(tx, member, {
        action: 'template.updated',
        resource_type: 'permission_template',
        resource_id: id,
        details: {
          before: { name: template.name },
          after: { name: dto.name },
        },
      });
    });
    return this.get(member.clinic_id, id);
  }

  async remove(member: MembershipContext, id: string): Promise<void> {
    const template = await this.find(member.clinic_id, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.permissionTemplateItem.deleteMany({
        where: { template_id: id },
      });
      await tx.permissionTemplate.delete({
        where: { id, clinic_id: member.clinic_id },
      });
      await audit(tx, member, {
        action: 'template.deleted',
        resource_type: 'permission_template',
        resource_id: id,
        details: { code: template.code },
      });
    });
  }

  /** Replaces the template's items. Only items the caller holds can be put in. */
  async setPermissions(
    member: MembershipContext,
    caller: ReadonlySet<string>,
    id: string,
    codes: string[],
  ): Promise<PermissionTemplateDto> {
    await this.find(member.clinic_id, id);
    const idOf = await grantablePermissionIds(this.prisma, caller, codes);
    await this.prisma.$transaction(async (tx) => {
      await tx.permissionTemplateItem.deleteMany({
        where: { template_id: id },
      });
      await tx.permissionTemplateItem.createMany({
        data: [...idOf.values()].map((permission_id) => ({
          template_id: id,
          permission_id,
        })),
      });
      await audit(tx, member, {
        action: 'template.permissions_set',
        resource_type: 'permission_template',
        resource_id: id,
        details: { permissions: [...idOf.keys()] },
      });
    });
    return this.get(member.clinic_id, id);
  }

  async find(clinicId: string, id: string): Promise<PermissionTemplate> {
    const template = await this.prisma.permissionTemplate.findFirst({
      where: { id, clinic_id: clinicId },
    });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  /** The template's current item codes. */
  async codes(templateId: string): Promise<string[]> {
    const items = await this.prisma.permissionTemplateItem.findMany({
      where: { template_id: templateId },
      select: { permission_id: true },
    });
    return [
      ...(
        await codesOf(
          this.prisma,
          items.map((i) => i.permission_id),
        )
      ).values(),
    ];
  }

  private async describe(
    templates: PermissionTemplate[],
  ): Promise<PermissionTemplateDto[]> {
    if (templates.length === 0) return [];
    const items = await this.prisma.permissionTemplateItem.findMany({
      where: { template_id: { in: templates.map((t) => t.id) } },
    });
    const code = await codesOf(
      this.prisma,
      items.map((i) => i.permission_id),
    );
    const order = [...code.keys()];
    return templates.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      permissions: items
        .filter((i) => i.template_id === t.id && code.has(i.permission_id))
        .sort(
          (a, b) =>
            order.indexOf(a.permission_id) - order.indexOf(b.permission_id),
        )
        .map((i) => code.get(i.permission_id)!),
    }));
  }
}
