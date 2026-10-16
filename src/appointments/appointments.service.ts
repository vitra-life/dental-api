import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { AppointmentStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { canChangeStatus, isEditable } from './appointment-status.js';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto.js';
import { UpdateAppointmentDto } from './dto/update-appointment.dto.js';

const MAX_RANGE_DAYS = 93;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const include = {
  client: {
    select: { id: true, first_name: true, last_name: true, phone: true },
  },
  service: { select: { id: true, name: true } },
} satisfies Prisma.AppointmentInclude;

/** A 400 in the same shape as a validation error, for one field. */
function fieldError(field: string, error: string) {
  return new BadRequestException({
    message: 'Validation failed',
    details: [{ field, errors: [error] }],
  });
}

function assertEndAfterStart(start: Date, end: Date) {
  if (end <= start) {
    throw fieldError('end_time', 'end_time must be after start_time');
  }
}

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(clinicId: string, query: ListAppointmentsQueryDto) {
    const { from, to, status, client_id } = query;
    if ((from === undefined) !== (to === undefined)) {
      throw new BadRequestException('from and to must be sent together');
    }
    if (!from && !client_id) {
      throw new BadRequestException('Send from and to, or client_id');
    }

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

    return this.prisma.appointment.findMany({
      where: { clinic_id: clinicId, client_id, status, start_time },
      include,
      orderBy: [{ start_time: 'asc' }, { id: 'asc' }],
    });
  }

  async get(clinicId: string, id: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, clinic_id: clinicId },
      include,
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }

  async create(clinicId: string, dto: CreateAppointmentDto) {
    await this.assertClient(clinicId, dto.client_id);
    const service = await this.bookableService(clinicId, dto.service_id);

    const start = new Date(dto.start_time);
    const end = dto.end_time
      ? new Date(dto.end_time)
      : new Date(start.getTime() + service.duration_minutes * MINUTE);
    assertEndAfterStart(start, end);

    return this.prisma.appointment.create({
      data: {
        clinic_id: clinicId,
        client_id: dto.client_id,
        service_id: service.id,
        start_time: start,
        end_time: end,
        price: dto.price ?? service.default_price,
        description: dto.description ?? null,
      },
      include,
    });
  }

  async update(clinicId: string, id: string, dto: UpdateAppointmentDto) {
    const current = await this.get(clinicId, id);
    if (!isEditable(current.status)) {
      throw new ConflictException(
        `A ${current.status} appointment can no longer be edited`,
      );
    }
    if (dto.client_id && dto.client_id !== current.client_id) {
      await this.assertClient(clinicId, dto.client_id);
    }
    if (dto.service_id && dto.service_id !== current.service_id) {
      await this.bookableService(clinicId, dto.service_id);
    }

    const start = dto.start_time
      ? new Date(dto.start_time)
      : current.start_time;
    let end = current.end_time;
    if (dto.end_time) {
      end = new Date(dto.end_time);
    } else if (dto.start_time) {
      // Rescheduled without an end: keep the same length.
      end = new Date(
        start.getTime() +
          (current.end_time.getTime() - current.start_time.getTime()),
      );
    }
    assertEndAfterStart(start, end);

    return this.prisma.appointment.update({
      where: { id, clinic_id: clinicId },
      data: {
        client_id: dto.client_id,
        service_id: dto.service_id,
        start_time: start,
        end_time: end,
        price: dto.price,
        description: dto.description,
      },
      include,
    });
  }

  async changeStatus(clinicId: string, id: string, status: AppointmentStatus) {
    const current = await this.get(clinicId, id);
    if (current.status === status) return current;
    if (!canChangeStatus(current.status, status)) {
      throw new ConflictException(
        `A ${current.status} appointment cannot become ${status}`,
      );
    }
    // Only if nobody changed the status in the meantime.
    const { count } = await this.prisma.appointment.updateMany({
      where: { id, clinic_id: clinicId, status: current.status },
      data: { status },
    });
    if (count === 0) {
      throw new ConflictException(
        'The appointment was changed by someone else; reload and try again',
      );
    }
    return this.get(clinicId, id);
  }

  private async assertClient(clinicId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, clinic_id: clinicId },
      select: { id: true },
    });
    if (!client) {
      throw fieldError('client_id', 'client_id is not a client of this clinic');
    }
  }

  private async bookableService(clinicId: string, serviceId: string) {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, clinic_id: clinicId },
    });
    if (!service) {
      throw fieldError(
        'service_id',
        'service_id is not a service of this clinic',
      );
    }
    if (!service.active) {
      throw fieldError(
        'service_id',
        'The service is inactive and cannot be booked',
      );
    }
    return service;
  }
}
