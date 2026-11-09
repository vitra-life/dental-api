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
  MembershipContext,
  WorkspaceContext,
} from '../../../common/auth/auth-request.js';
import {
  appointmentScopeWhere,
  canBookFor,
} from '../../../common/auth/access-scope.js';
import { P } from '../../../common/auth/permission-catalog.js';
import {
  conflict,
  fieldError,
  forbidden,
} from '../../../common/http/errors.js';
import { isActiveDoctor, memberNames } from '../../../common/staff/doctors.js';
import type { Db } from '../../../core/prisma/db.js';
import { lockMembership } from '../../../core/prisma/locks.js';
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

/** The permission each target status needs on `PATCH /:id/status`. */
const STATUS_PERMISSION: Partial<Record<AppointmentStatus, string>> = {
  confirmed: P.appointmentConfirm,
  completed: P.appointmentComplete,
  no_show: P.appointmentNoShow,
};

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The appointments the workspace sees, by start time. */
  async list(workspace: WorkspaceContext, query: ListAppointmentsQueryDto) {
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
        client_id,
        status,
        start_time,
        ...appointmentScopeWhere(workspace),
      },
      orderBy: [{ start_time: 'asc' }, { id: 'asc' }],
    });
    return this.withDetails(rows);
  }

  async get(workspace: WorkspaceContext, id: string): Promise<AppointmentDto> {
    const [appointment] = await this.withDetails([
      await this.visible(workspace, id),
    ]);
    return appointment;
  }

  async create(
    member: MembershipContext,
    workspace: WorkspaceContext,
    dto: CreateAppointmentDto,
  ) {
    await this.assertClient(member.clinic_id, dto.client_id);
    const service = await this.bookableService(
      member.clinic_id,
      dto.service_id,
    );
    await this.assertDoctor(workspace, dto.doctor_membership_id);

    const start = new Date(dto.start_time);
    const duration =
      dto.duration_minutes ?? defaultDuration(service.duration_minutes);

    // Checked and written under the doctor's lock, so two bookings made at
    // the same moment can't both take the time.
    const created = await this.prisma.$transaction(async (tx) => {
      await lockMembership(tx, dto.doctor_membership_id);
      await this.assertFree(
        tx,
        member.clinic_id,
        dto.doctor_membership_id,
        start,
        duration,
      );
      return tx.appointment.create({
        data: {
          clinic_id: member.clinic_id,
          client_id: dto.client_id,
          service_id: service.id,
          doctor_membership_id: dto.doctor_membership_id,
          created_by_membership_id: member.id,
          created_by_workspace_id: workspace.id,
          start_time: start,
          duration_minutes: duration,
          description: dto.description ?? null,
        },
      });
    });
    return this.load(member.clinic_id, created.id);
  }

  async update(
    member: MembershipContext,
    workspace: WorkspaceContext,
    id: string,
    dto: UpdateAppointmentDto,
  ) {
    const current = await this.visible(workspace, id);
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
      await this.assertDoctor(workspace, dto.doctor_membership_id);
    }
    const start = dto.start_time
      ? new Date(dto.start_time)
      : current.start_time;
    const duration = dto.duration_minutes ?? current.duration_minutes;
    const moves = Boolean(
      doctor &&
      (dto.start_time || dto.duration_minutes || dto.doctor_membership_id),
    );

    await this.prisma.$transaction(async (tx) => {
      if (moves && doctor) {
        await lockMembership(tx, doctor);
        await this.assertFree(
          tx,
          member.clinic_id,
          doctor,
          start,
          duration,
          id,
        );
      }
      await tx.appointment.update({
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
    });
    return this.load(member.clinic_id, id);
  }

  /**
   * Confirm, complete or mark a no-show; each needs its own permission
   * (`appointment.confirm`, `.complete`, `.no_show`). Cancelling is `cancel()`.
   */
  async changeStatus(
    member: MembershipContext,
    workspace: WorkspaceContext,
    permissions: ReadonlySet<string>,
    id: string,
    status: AppointmentStatus,
  ) {
    const needed = STATUS_PERMISSION[status];
    if (!needed)
      throw fieldError('status', 'Use the cancel endpoint to cancel');
    if (!permissions.has(needed)) throw forbidden(needed);
    const current = await this.visible(workspace, id);
    await this.setStatus(this.prisma, member.clinic_id, current, status);
    return this.load(member.clinic_id, id);
  }

  async cancel(
    member: MembershipContext,
    workspace: WorkspaceContext,
    id: string,
  ) {
    const current = await this.visible(workspace, id);
    await this.prisma.$transaction(async (tx) => {
      // Only a real change is recorded; cancelling twice is a no-op.
      if (await this.setStatus(tx, member.clinic_id, current, 'cancelled')) {
        await audit(tx, member, {
          action: 'appointment.cancelled',
          resource_type: 'appointment',
          resource_id: id,
        });
      }
    });
    return this.load(member.clinic_id, id);
  }

  /** Hides the appointment everywhere (soft delete); it no longer blocks the doctor's time. */
  async remove(
    member: MembershipContext,
    workspace: WorkspaceContext,
    id: string,
  ): Promise<void> {
    await this.visible(workspace, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id, clinic_id: member.clinic_id },
        data: { deleted_at: new Date() },
      });
      await audit(tx, member, {
        action: 'appointment.deleted',
        resource_type: 'appointment',
        resource_id: id,
      });
    });
  }

  /** Moves `current` to `status`; false if it already had it. */
  private async setStatus(
    db: Db,
    clinicId: string,
    current: Appointment,
    status: AppointmentStatus,
  ): Promise<boolean> {
    if (current.status === status) return false;
    if (!canChangeStatus(current.status, status)) {
      throw new ConflictException(
        `A ${current.status} appointment cannot become ${status}`,
      );
    }
    // Only if nobody changed the status in the meantime.
    const { count } = await db.appointment.updateMany({
      where: { id: current.id, clinic_id: clinicId, status: current.status },
      data: { status },
    });
    if (count === 0) {
      throw new ConflictException(
        'The appointment was changed by someone else; reload and try again',
      );
    }
    return true;
  }

  /** The appointment, if the workspace sees it; otherwise 404. */
  private async visible(
    workspace: WorkspaceContext,
    id: string,
  ): Promise<Appointment> {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, ...appointmentScopeWhere(workspace) },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }

  /** The appointment after a change the caller was allowed to make (it may now be another doctor's). */
  private async load(clinicId: string, id: string): Promise<AppointmentDto> {
    const appointment = await this.prisma.appointment.findFirstOrThrow({
      where: { id, clinic_id: clinicId, deleted_at: null },
    });
    const [result] = await this.withDetails([appointment]);
    return result;
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
      where: { id: clientId, clinic_id: clinicId, deleted_at: null },
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

  /** The doctor must be an active doctor of the clinic, and the workspace's own doctor unless it is clinic-wide. */
  private async assertDoctor(workspace: WorkspaceContext, doctorId: string) {
    if (!(await isActiveDoctor(this.prisma, workspace.clinic_id, doctorId))) {
      throw fieldError(
        'doctor_membership_id',
        'doctor_membership_id is not an active doctor of this clinic',
      );
    }
    if (!canBookFor(workspace, doctorId)) {
      throw new ForbiddenException({
        message: 'This workspace can only book for its own doctor',
        details: { reason: 'doctor_not_allowed' },
      });
    }
  }

  /**
   * A doctor cannot have two pending or confirmed appointments at the same
   * time. Call under `lockMembership(doctorId)` in the same transaction.
   */
  private async assertFree(
    db: Db,
    clinicId: string,
    doctorId: string,
    start: Date,
    minutes: number,
    exceptId?: string,
  ) {
    const candidates = await db.appointment.findMany({
      where: {
        clinic_id: clinicId,
        doctor_membership_id: doctorId,
        deleted_at: null,
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
      throw conflict(
        'overlap',
        'The doctor already has an appointment at this time',
        { appointment_id: clash.id },
      );
    }
  }
}
