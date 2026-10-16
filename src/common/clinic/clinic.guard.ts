import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { UUID_PATTERN } from '../validators/uuid.js';
import { CLINIC_HEADER, ClinicRequest } from './clinic-request.js';

/**
 * Decides which clinic the request acts for and stores it on the request.
 * For now it comes from the `x-clinic-id` header; once login exists it will
 * come from the token, and only this guard changes.
 */
@Injectable()
export class ClinicGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ClinicRequest>();
    const header = request.headers[CLINIC_HEADER];
    const clinicId = Array.isArray(header) ? header[0] : header;

    if (!clinicId) {
      throw new BadRequestException(`The ${CLINIC_HEADER} header is required`);
    }
    if (!UUID_PATTERN.test(clinicId)) {
      throw new BadRequestException(
        `The ${CLINIC_HEADER} header must be a UUID`,
      );
    }
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true },
    });
    if (!clinic) throw new NotFoundException('Clinic not found');

    request.clinic_id = clinic.id;
    return true;
  }
}
