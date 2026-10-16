import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { AppointmentStatus } from '../../../../generated/prisma/enums.js';
import { IsDateTimeWithZone } from '../../../../common/validators/dates.js';
import { IsUuid } from '../../../../common/validators/uuid.js';

/** Either `from` and `to`, or `client_id`, is required. */
export class ListAppointmentsQueryDto {
  /** Appointments starting at or after this moment. */
  @ApiPropertyOptional({ example: '2026-10-01T00:00:00+03:30' })
  @IsOptional()
  @IsDateTimeWithZone()
  from?: string;

  /** Appointments starting before this moment. At most 93 days after `from`. */
  @ApiPropertyOptional({ example: '2026-11-01T00:00:00+03:30' })
  @IsOptional()
  @IsDateTimeWithZone()
  to?: string;

  @ApiPropertyOptional({ enum: AppointmentStatus })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @IsOptional()
  @IsUuid()
  client_id?: string;
}
