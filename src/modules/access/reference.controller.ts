import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PERMISSION_CATALOG } from '../../common/auth/permission-catalog.js';
import { ClinicScoped } from '../../common/clinic/clinic-scoped.decorator.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { PermissionGroupDto, ReferenceItemDto } from './dto/template.dto.js';

/** Lists any workspace may read. */
@ApiTags('reference')
@ClinicScoped()
@Controller()
export class ReferenceController {
  constructor(private readonly prisma: PrismaService) {}

  /** The permission catalogue: every action, in groups, with Persian labels. */
  @Get('permissions')
  @ApiOkResponse({ type: [PermissionGroupDto] })
  permissions(): PermissionGroupDto[] {
    return PERMISSION_CATALOG.map((group) => ({
      code: group.code,
      label: group.label,
      items: group.items.map((item) => ({
        code: item.code,
        label: item.label,
        description: item.description ?? null,
      })),
    }));
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

  /** Kinds of position in a doctor's workspace (secretary of, assistant of, ...). */
  @Get('relationship-types')
  @ApiOkResponse({ type: [ReferenceItemDto] })
  relationshipTypes() {
    return this.prisma.relationshipType.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
  }
}
