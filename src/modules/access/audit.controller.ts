import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/auth/decorators.js';
import { P } from '../../common/auth/permission-catalog.js';
import { ClinicId } from '../../common/clinic/clinic-id.decorator.js';
import { ClinicScoped } from '../../common/clinic/clinic-scoped.decorator.js';
import { pageArgs, type Page } from '../../common/dto/page-query.dto.js';
import { memberNames } from '../../common/staff/doctors.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import {
  AuditLogDto,
  AuditLogPageDto,
  ListAuditLogsQueryDto,
} from './dto/audit.dto.js';

/** Read-only: audit entries cannot be changed or deleted through the API. */
@ApiTags('audit')
@ClinicScoped()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  /** Newest first. */
  @Get()
  @RequirePermission(P.auditView)
  @ApiOkResponse({ type: AuditLogPageDto })
  async list(
    @ClinicId() clinicId: string,
    @Query() query: ListAuditLogsQueryDto,
  ): Promise<Page<AuditLogDto>> {
    const where = {
      clinic_id: clinicId,
      action: query.action,
      resource_type: query.resource_type,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    const names = await memberNames(
      this.prisma,
      rows.map((r) => r.actor_membership_id),
    );
    return {
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        resource_type: r.resource_type,
        resource_id: r.resource_id,
        actor_membership_id: r.actor_membership_id,
        actor_name: names.get(r.actor_membership_id) ?? '',
        details: r.details,
        created_at: r.created_at,
      })),
      total,
      page: query.page,
      page_size: query.page_size,
    };
  }
}
