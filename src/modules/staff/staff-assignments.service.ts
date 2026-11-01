import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { StaffAssignment } from '../../generated/prisma/client.js';
import { audit } from '../../common/audit/audit.js';
import type { MembershipContext } from '../../common/auth/auth-request.js';
import {
  doctorMembershipIds,
  memberNames,
} from '../../common/staff/doctors.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type {
  CreateStaffAssignmentDto,
  StaffAssignmentDto,
} from './dto/staff.dto.js';

/** A 400 in the same shape as a validation error, for one field. */
function fieldError(field: string, error: string) {
  return new BadRequestException({
    message: 'Validation failed',
    details: [{ field, errors: [error] }],
  });
}

/**
 * Which staff member works for which doctor. An assignment feeds the
 * `assigned` scope; on its own it grants nothing.
 */
@Injectable()
export class StaffAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(clinicId: string): Promise<StaffAssignmentDto[]> {
    const rows = await this.prisma.staffAssignment.findMany({
      where: { clinic_id: clinicId },
      orderBy: { created_at: 'asc' },
    });
    return this.describe(rows);
  }

  async create(
    actor: MembershipContext,
    dto: CreateStaffAssignmentDto,
  ): Promise<StaffAssignmentDto> {
    if (dto.staff_membership_id === dto.doctor_membership_id) {
      throw fieldError(
        'doctor_membership_id',
        'A member cannot be assigned to themselves',
      );
    }
    const staff = await this.prisma.clinicMembership.findFirst({
      where: {
        id: dto.staff_membership_id,
        clinic_id: actor.clinic_id,
        is_active: true,
      },
    });
    if (!staff)
      throw fieldError(
        'staff_membership_id',
        'staff_membership_id is not an active member of this clinic',
      );
    if (
      !(await doctorMembershipIds(this.prisma, actor.clinic_id)).includes(
        dto.doctor_membership_id,
      )
    ) {
      throw fieldError(
        'doctor_membership_id',
        'doctor_membership_id is not an active doctor of this clinic',
      );
    }
    const type = await this.prisma.relationshipType.findUnique({
      where: { code: dto.relationship_type },
    });
    if (!type)
      throw fieldError('relationship_type', 'Unknown relationship type');

    const row = await this.prisma.staffAssignment.create({
      data: {
        clinic_id: actor.clinic_id,
        staff_membership_id: dto.staff_membership_id,
        doctor_membership_id: dto.doctor_membership_id,
        relationship_type_id: type.id,
      },
    });
    await audit(this.prisma, actor, {
      action: 'staff.assigned',
      resource_type: 'staff_assignment',
      resource_id: row.id,
      details: {
        staff: dto.staff_membership_id,
        doctor: dto.doctor_membership_id,
        type: dto.relationship_type,
      },
    });
    const [described] = await this.describe([row]);
    return described;
  }

  async remove(actor: MembershipContext, id: string): Promise<void> {
    const row = await this.prisma.staffAssignment.findFirst({
      where: { id, clinic_id: actor.clinic_id },
    });
    if (!row) throw new NotFoundException('Assignment not found');
    await this.prisma.staffAssignment.delete({ where: { id } });
    await audit(this.prisma, actor, {
      action: 'staff.unassigned',
      resource_type: 'staff_assignment',
      resource_id: id,
      details: {
        staff: row.staff_membership_id,
        doctor: row.doctor_membership_id,
      },
    });
  }

  private async describe(
    rows: StaffAssignment[],
  ): Promise<StaffAssignmentDto[]> {
    if (rows.length === 0) return [];
    const [names, types] = await Promise.all([
      memberNames(
        this.prisma,
        rows.flatMap((r) => [r.staff_membership_id, r.doctor_membership_id]),
      ),
      this.prisma.relationshipType.findMany({
        where: { id: { in: rows.map((r) => r.relationship_type_id) } },
      }),
    ]);
    const type = new Map(types.map((t) => [t.id, t]));
    return rows.map((r) => ({
      id: r.id,
      staff_membership_id: r.staff_membership_id,
      staff_name: names.get(r.staff_membership_id) ?? '',
      doctor_membership_id: r.doctor_membership_id,
      doctor_name: names.get(r.doctor_membership_id) ?? '',
      relationship_type: type.get(r.relationship_type_id)?.code ?? '',
      relationship_name: type.get(r.relationship_type_id)?.name ?? '',
      is_active: r.is_active,
      created_at: r.created_at,
    }));
  }
}
