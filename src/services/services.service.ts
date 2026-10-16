import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { ListServicesQueryDto } from './dto/list-services-query.dto.js';
import { UpdateServiceDto } from './dto/update-service.dto.js';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  list(clinicId: string, query: ListServicesQueryDto) {
    return this.prisma.service.findMany({
      where: {
        clinic_id: clinicId,
        category: query.category,
        active: query.active,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async get(clinicId: string, id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, clinic_id: clinicId },
    });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  create(clinicId: string, dto: CreateServiceDto) {
    return this.prisma.service.create({
      // The DTO is plain data; losing its prototype is intended.
      // oxlint-disable-next-line typescript/no-misused-spread
      data: { ...dto, clinic_id: clinicId },
    });
  }

  update(clinicId: string, id: string, dto: UpdateServiceDto) {
    return this.prisma.service.update({
      where: { id, clinic_id: clinicId },
      data: dto,
    });
  }

  async remove(clinicId: string, id: string) {
    try {
      await this.prisma.service.delete({ where: { id, clinic_id: clinicId } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'The service has appointments and cannot be deleted; deactivate it instead',
        );
      }
      throw error;
    }
  }
}
