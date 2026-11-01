import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Appointment, Prisma } from '../../../generated/prisma/client.js';
import type { AppointmentStatus } from '../../../generated/prisma/enums.js';
import { audit } from '../../../common/audit/audit.js';
import type {
  AccessContext,
  MembershipContext,
} from '../../../common/auth/auth-request.js';
import {
  allowedDoctorIds,
  appointmentScopeWhere,
} from '../../../common/auth/access-scope.js';
import { isActiveDoctor, memberNames } from '../../../common/staff/doctors.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import {
  APPOINTMENT_DURATIONS,
  defaultDuration,
} from './appointment-duration.js';
import { overlaps } from './appointment-overlap.js';
import { canChangeStatus, isEditable } from './appointment-status.js';
import type { AppointmentDto } from './dto/appointment.dto.js';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto.js';
import { UpdateAppointmentDto } from './dto/update-appointment.dto.js';

const MAX_RANGE_DAYS = 366;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const LONGEST = Math.max(...APPOINTMENT_DURATIONS);

/** A 400 in the same shape as a validation error, for one field. */
function fieldError(field: string, error: string) {
  return new BadRequestException({
    message: 'Validation failed',
    details: [{ field, errors: [error] }],
  });
}

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The appointments the caller's scope reaches, by start time. */
  async list(
    member: MembershipContext,
    access: AccessContext,
    query: ListAppointmentsQueryDto,
  ) {
    const { from, to, status, client_id } = query;
    if ((from === undefined) !== (to === undefined)) {
      throw new BadRequestException('from and to must be sent together');
    }
    if (!from && !client_id)
      throw new BadRequestException('Send from and to, or client_id');

    let start_time: Prisma.DateTimeFilter | undefined;
    if (from && to) {
      const gte = new Date(from);
      const lt = new Date(to);
      if (lt <= gte) throw fieldError('to', 'to must be after from');
      if (lt.getTime() - gte.getTime() > MAX_RANGE_DAYS * DAY) {
        throw fieldError(
          'to',
          `to must be at most ${MAX_RANGE_DAYS} days after from`,
        );
      }
      start_time = { gte, lt };
    }

    const rows = await this.prisma.appointment.findMany({
      where: {
        clinic_id: member.clinic_id,
        client_id,
        status,
        start_time,
        ...(await appointmentScopeWhere(this.prisma, access.scope, member)),
      },
      orderBy: [{ start_time: 'asc' }, { id: 'asc' }],
    });
    return this.withDetails(rows);
  }

  async get(
    member: MembershipContext,
    access: AccessContext,
    id: string,
  ): Promise<AppointmentDto> {
    const [appointment] = await this.withDetails([
      await this.visible(member, access, id),
    ]);
    return appointment;
  }

  async create(
    member: MembershipContext,
    access: AccessContext,
    dto: CreateAppointmentDto,
  ) {
    await this.assertClient(member.clinic_id, dto.client_id);
    const service = await this.bookableService(
      member.clinic_id,
      dto.service_id,
    );
    await this.assertDoctor(member, access, dto.doctor_membership_id);

    const start = new Date(dto.start_time);
    const duration =
      dto.duration_minutes ?? defaultDuration(service.duration_minutes);
    await this.assertFree(
      member.clinic_id,
      dto.doctor_membership_id,
      start,
      duration,
    );

    const created = await this.prisma.appointment.create({
      data: {
        clinic_id: member.clinic_id,
        client_id: dto.client_id,
        service_id: service.id,
        doctor_membership_id: dto.doctor_membership_id,
        created_by_membership_id: member.id,
        start_time: start,
        duration_minutes: duration,
        description: dto.description ?? null,
      },
    });
    return this.get(member, { ...access, scope: 'clinic' }, created.id);
  }

  async update(
    member: MembershipContext,
    access: AccessContext,
    id: string,
    dto: UpdateAppointmentDto,
  ) {
    const current = await this.visible(member, access, id);
    if (!isEditable(current.status)) {
      throw new ConflictException(
        `A ${current.status} appointment can no longer be edited`,
      );
    }
    if (dto.client_id && dto.client_id !== current.client_id) {
      await this.assertClient(member.clinic_id, dto.client_id);
    }
    if (dto.service_id && dto.service_id !== current.service_id) {
      await this.bookableService(member.clinic_id, dto.service_id);
    }
    const doctor = dto.doctor_membership_id ?? current.doctor_membership_id;
    if (
      dto.doctor_membership_id &&
      dto.doctor_membership_id !== current.doctor_membership_id
    ) {
      await this.assertDoctor(member, access, dto.doctor_membership_id);
    }
    const start = dto.start_time
      ? new Date(dto.start_time)
      : current.start_time;
    const duration = dto.duration_minutes ?? current.duration_minutes;
    if (
      doctor &&
      (dto.start_time || dto.duration_minutes || dto.doctor_membership_id)
    ) {
      await this.assertFree(member.clinic_id, doctor, start, duration, id);
    }

    await this.prisma.appointment.update({
      where: { id, clinic_id: member.clinic_id },
      data: {
        client_id: dto.client_id,
        service_id: dto.service_id,
        doctor_membership_id: dto.doctor_membership_id,
        start_time: dto.start_time ? start : undefined,
        duration_minutes: dto.duration_minutes,
        description: dto.description,
      },
    });
    return this.get(member, { ...access, scope: 'clinic' }, id);
  }

  /** Confirm, complete or mark a no-show. Cancelling is `cancel()`. */
  changeStatus(
    member: MembershipContext,
    access: AccessContext,
    id: string,
    status: AppointmentStatus,
  ) {
    return this.setStatus(member, access, id, status);
  }

  async cancel(member: MembershipContext, access: AccessContext, id: string) {
    const result = await this.setStatus(member, access, id, 'cancelled');
    await audit(this.prisma, member, {
      action: 'appointment.cancelled',
      resource_type: 'appointment',
      resource_id: id,
    });
    return result;
  }

  private async setStatus(
    member: MembershipContext,
    access: AccessContext,
    id: string,
    status: AppointmentStatus,
  ) {
    const current = await this.visible(member, access, id);
    if (current.status !== status) {
      if (!canChangeStatus(current.status, status)) {
        throw new ConflictException(
          `A ${current.status} appointment cannot become ${status}`,
        );
      }
      // Only if nobody changed the status in the meantime.
      const { count } = await this.prisma.appointment.updateMany({
        where: { id, clinic_id: member.clinic_id, status: current.status },
        data: { status },
      });
      if (count === 0) {
        throw new ConflictException(
          'The appointment was changed by someone else; reload and try again',
        );
      }
    }
    return this.get(member, { ...access, scope: 'clinic' }, id);
  }

  /** The appointment, if the caller's scope reaches it; otherwise 404. */
  private async visible(
    member: MembershipContext,
    access: AccessContext,
    id: string,
  ): Promise<Appointment> {
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id,
        clinic_id: member.clinic_id,
        ...(await appointmentScopeWhere(this.prisma, access.scope, member)),
      },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }

  /** Attaches client, service and doctor, with one query per kind for all rows. */
  private async withDetails(rows: Appointment[]): Promise<AppointmentDto[]> {
    if (rows.length === 0) return [];
    const [clients, services, doctors] = await Promise.all([
      this.prisma.client.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.client_id))] } },
        select: { id: true, first_name: true, last_name: true, phone: true },
      }),
      this.prisma.service.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.service_id))] } },
        select: { id: true, name: true },
      }),
      memberNames(
        this.prisma,
        rows.flatMap((r) =>
          r.doctor_membership_id ? [r.doctor_membership_id] : [],
        ),
      ),
    ]);
    const client = new Map(clients.map((c) => [c.id, c]));
    const service = new Map(services.map((s) => [s.id, s]));
    return rows.map((row) => ({
      ...row,
      // Without foreign keys a referenced row could be missing; show a placeholder rather than fail.
      client: client.get(row.client_id) ?? {
        id: row.client_id,
        first_name: '',
        last_name: '',
        phone: '',
      },
      service: service.get(row.service_id) ?? { id: row.service_id, name: '' },
      doctor: row.doctor_membership_id
        ? {
            membership_id: row.doctor_membership_id,
            full_name: doctors.get(row.doctor_membership_id) ?? '',
          }
        : null,
    }));
  }

  private async assertClient(clinicId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, clinic_id: clinicId },
      select: { id: true },
    });
    if (!client)
      throw fieldError('client_id', 'client_id is not a client of this clinic');
  }

  private async bookableService(clinicId: string, serviceId: string) {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, clinic_id: clinicId },
    });
    if (!service)
      throw fieldError(
        'service_id',
        'service_id is not a service of this clinic',
      );
    if (!service.active)
      throw fieldError(
        'service_id',
        'The service is inactive and cannot be booked',
      );
    return service;
  }

  /** The doctor must be an active doctor of the clinic, and one the caller's scope lets them book for. */
  private async assertDoctor(
    member: MembershipContext,
    access: AccessContext,
    doctorId: string,
  ) {
    if (!(await isActiveDoctor(this.prisma, member.clinic_id, doctorId))) {
      throw fieldError(
        'doctor_membership_id',
        'doctor_membership_id is not an active doctor of this clinic',
      );
    }
    const allowed = await allowedDoctorIds(this.prisma, access.scope, member);
    if (allowed !== null && !allowed.includes(doctorId)) {
      throw new ForbiddenException({
        message: 'You can only book appointments for your own doctors',
        details: { reason: 'doctor_not_allowed' },
      });
    }
  }

  /** A doctor cannot have two pending or confirmed appointments at the same time. */
  private async assertFree(
    clinicId: string,
    doctorId: string,
    start: Date,
    minutes: number,
    exceptId?: string,
  ) {
    const candidates = await this.prisma.appointment.findMany({
      where: {
        clinic_id: clinicId,
        doctor_membership_id: doctorId,
        status: { in: ['pending', 'confirmed'] },
        id: exceptId ? { not: exceptId } : undefined,
        start_time: {
          gt: new Date(start.getTime() - LONGEST * MINUTE),
          lt: new Date(start.getTime() + minutes * MINUTE),
        },
      },
      select: { id: true, start_time: true, duration_minutes: true },
    });
    const clash = candidates.find((c) =>
      overlaps(start, minutes, c.start_time, c.duration_minutes),
    );
    if (clash) {
      throw new ConflictException({
        message: 'The doctor already has an appointment at this time',
        details: { reason: 'overlap', appointment_id: clash.id },
      });
    }
  }
}
