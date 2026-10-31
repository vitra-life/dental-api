import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  type CatalogItem,
  PERMISSION_CATALOG,
} from '../../common/auth/permission-catalog.js';
import { ClinicScoped } from '../../common/clinic/clinic-scoped.decorator.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { PermissionNodeDto, ReferenceItemDto } from './dto/role.dto.js';

const toNode = (item: CatalogItem): PermissionNodeDto => ({
  code: item.code,
  kind: item.kind,
  label: item.label,
  description: item.description ?? null,
  scoped: item.scoped ?? false,
  children: (item.children ?? []).map(toNode),
});

/** Lists any member of the clinic may read. */
@ApiTags('reference')
@ClinicScoped()
@Controller()
export class ReferenceController {
  constructor(private readonly prisma: PrismaService) {}

  /** The permission catalogue as a tree: pages → features → actions, with Persian labels. */
  @Get('permissions')
  @ApiOkResponse({ type: [PermissionNodeDto] })
  permissions(): PermissionNodeDto[] {
    return PERMISSION_CATALOG.map(toNode);
  }

  /** Professional types: doctor, secretary, assistant. */
  @Get('staff-types')
  @ApiOkResponse({ type: [ReferenceItemDto] })
  staffTypes() {
    return this.prisma.staffType.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
  }

  /** Kinds of staff ↔ doctor relationship. */
  @Get('relationship-types')
  @ApiOkResponse({ type: [ReferenceItemDto] })
  relationshipTypes() {
    return this.prisma.relationshipType.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
  }
}
