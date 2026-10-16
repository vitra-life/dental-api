import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Client } from '../generated/prisma/client.js';
import { Page, pageArgs } from '../common/dto/page-query.dto.js';
import { formatDateOnly, parseDateOnly } from '../common/validators/dates.js';
import { toLatinDigits } from '../common/validators/transforms.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClientDto } from './dto/client.dto.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { ListClientsQueryDto } from './dto/list-clients-query.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';

const withAppointmentCount = {
  _count: { select: { appointments: true } },
} satisfies Prisma.ClientInclude;

type ClientWithCount = Client & { _count: { appointments: number } };

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    clinicId: string,
    query: ListClientsQueryDto,
  ): Promise<Page<ClientDto>> {
    const words = toLatinDigits(query.q ?? '')
      .split(/\s+/)
      .filter(Boolean);
    const where: Prisma.ClientWhereInput = {
      clinic_id: clinicId,
      AND: words.map((word) => ({
        OR: [
          { first_name: { contains: word } },
          { last_name: { contains: word } },
          { phone: { contains: word } },
          { national_id: { contains: word } },
        ],
      })),
    };
    const [clients, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        include: withAppointmentCount,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.client.count({ where }),
    ]);
    return {
      items: await this.withLastVisits(clinicId, clients),
      total,
      page: query.page,
      page_size: query.page_size,
    };
  }

  async get(clinicId: string, id: string): Promise<ClientDto> {
    const client = await this.prisma.client.findFirst({
      where: { id, clinic_id: clinicId },
      include: withAppointmentCount,
    });
    if (!client) throw new NotFoundException('Client not found');
    const [result] = await this.withLastVisits(clinicId, [client]);
    return result;
  }

  async create(clinicId: string, dto: CreateClientDto): Promise<ClientDto> {
    const client = await this.prisma.client.create({
      // The DTO is plain data; losing its prototype is intended.
      // oxlint-disable-next-line typescript/no-misused-spread
      data: { ...dto, ...birthDate(dto), clinic_id: clinicId },
    });
    return toClientDto(client, 0, null);
  }

  async update(
    clinicId: string,
    id: string,
    dto: UpdateClientDto,
  ): Promise<ClientDto> {
    await this.prisma.client.update({
      where: { id, clinic_id: clinicId },
      // The DTO is plain data; losing its prototype is intended.
      // oxlint-disable-next-line typescript/no-misused-spread
      data: { ...dto, ...birthDate(dto) },
    });
    return this.get(clinicId, id);
  }

  /** Adds each client's last completed visit, with one query for all of them. */
  private async withLastVisits(
    clinicId: string,
    clients: ClientWithCount[],
  ): Promise<ClientDto[]> {
    if (clients.length === 0) return [];
    const visits = await this.prisma.appointment.groupBy({
      by: ['client_id'],
      where: {
        clinic_id: clinicId,
        client_id: { in: clients.map((c) => c.id) },
        status: 'completed',
      },
      _max: { start_time: true },
    });
    const lastVisit = new Map(
      visits.map((v) => [v.client_id, v._max.start_time]),
    );
    return clients.map(({ _count, ...client }) =>
      toClientDto(
        client,
        _count.appointments,
        lastVisit.get(client.id) ?? null,
      ),
    );
  }
}

/** The `birth_date` column value for a request body, if the body has one. */
function birthDate(dto: { birth_date?: string | null }) {
  if (dto.birth_date === undefined) return {};
  return {
    birth_date: dto.birth_date === null ? null : parseDateOnly(dto.birth_date),
  };
}

function toClientDto(
  client: Client,
  appointmentCount: number,
  lastVisit: Date | null,
): ClientDto {
  return {
    ...client,
    birth_date: client.birth_date ? formatDateOnly(client.birth_date) : null,
    appointment_count: appointmentCount,
    last_visit: lastVisit,
  };
}
