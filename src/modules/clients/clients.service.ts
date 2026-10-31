import { Injectable, NotFoundException } from '@nestjs/common';
import type { Client, Prisma } from '../../generated/prisma/client.js';
import { audit } from '../../common/audit/audit.js';
import type {
  AccessContext,
  MembershipContext,
} from '../../common/auth/auth-request.js';
import { clientScopeWhere } from '../../common/auth/access-scope.js';
import { Page, pageArgs } from '../../common/dto/page-query.dto.js';
import {
  formatDateOnly,
  parseDateOnly,
} from '../../common/validators/dates.js';
import { toLatinDigits } from '../../common/validators/transforms.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { ClientDto } from './dto/client.dto.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { ListClientsQueryDto } from './dto/list-clients-query.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The clients the caller's scope reaches, newest first. */
  async list(
    member: MembershipContext,
    access: AccessContext,
    query: ListClientsQueryDto,
  ): Promise<Page<ClientDto>> {
    const words = toLatinDigits(query.q ?? '')
      .split(/\s+/)
      .filter(Boolean);
    const where: Prisma.ClientWhereInput = {
      clinic_id: member.clinic_id,
      AND: [
        await clientScopeWhere(this.prisma, access.scope, member),
        ...words.map((word) => ({
          OR: [
            { first_name: { contains: word } },
            { last_name: { contains: word } },
            { phone: { contains: word } },
            { national_id: { contains: word } },
          ],
        })),
      ],
    };
    const [clients, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.client.count({ where }),
    ]);
    return {
      items: await this.withVisits(member.clinic_id, clients),
      total,
      page: query.page,
      page_size: query.page_size,
    };
  }

  /** A client, if the caller's scope reaches it; otherwise 404. */
  async get(
    member: MembershipContext,
    access: AccessContext,
    id: string,
  ): Promise<ClientDto> {
    const [result] = await this.withVisits(member.clinic_id, [
      await this.visible(member, access, id),
    ]);
    return result;
  }

  async create(
    member: MembershipContext,
    dto: CreateClientDto,
  ): Promise<ClientDto> {
    const client = await this.prisma.client.create({
      data: {
        // The DTO is plain data; losing its prototype is intended.
        // oxlint-disable-next-line typescript/no-misused-spread
        ...dto,
        ...birthDate(dto),
        clinic_id: member.clinic_id,
        created_by_membership_id: member.id,
      },
    });
    return toClientDto(client, 0, null);
  }

  async update(
    member: MembershipContext,
    access: AccessContext,
    id: string,
    dto: UpdateClientDto,
  ): Promise<ClientDto> {
    await this.visible(member, access, id);
    await this.prisma.client.update({
      where: { id, clinic_id: member.clinic_id },
      // The DTO is plain data; losing its prototype is intended.
      // oxlint-disable-next-line typescript/no-misused-spread
      data: { ...dto, ...birthDate(dto) },
    });
    await audit(this.prisma, member, {
      action: 'client.updated',
      resource_type: 'client',
      resource_id: id,
      details: { fields: Object.keys(dto) },
    });
    return this.get(member, access, id);
  }

  private async visible(
    member: MembershipContext,
    access: AccessContext,
    id: string,
  ): Promise<Client> {
    const client = await this.prisma.client.findFirst({
      where: {
        id,
        clinic_id: member.clinic_id,
        ...(await clientScopeWhere(this.prisma, access.scope, member)),
      },
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  /** Adds each client's appointment count and last completed visit, with two queries for all of them. */
  private async withVisits(
    clinicId: string,
    clients: Client[],
  ): Promise<ClientDto[]> {
    if (clients.length === 0) return [];
    const ids = clients.map((c) => c.id);
    const [counts, visits] = await Promise.all([
      this.prisma.appointment.groupBy({
        by: ['client_id'],
        where: { clinic_id: clinicId, client_id: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.appointment.groupBy({
        by: ['client_id'],
        where: {
          clinic_id: clinicId,
          client_id: { in: ids },
          status: 'completed',
        },
        _max: { start_time: true },
      }),
    ]);
    const count = new Map(counts.map((c) => [c.client_id, c._count._all]));
    const lastVisit = new Map(
      visits.map((v) => [v.client_id, v._max.start_time]),
    );
    return clients.map((client) =>
      toClientDto(
        client,
        count.get(client.id) ?? 0,
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
