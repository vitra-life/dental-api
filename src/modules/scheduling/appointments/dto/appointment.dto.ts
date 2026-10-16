import { ApiProperty } from '@nestjs/swagger';
import { AppointmentStatus } from '../../../../generated/prisma/enums.js';

export class AppointmentClientDto {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
}

export class AppointmentServiceDto {
  id: string;
  name: string;
}

export class AppointmentDto {
  id: string;
  clinic_id: string;
  client_id: string;
  service_id: string;
  start_time: Date;
  end_time: Date;

  @ApiProperty({ enum: AppointmentStatus })
  status: AppointmentStatus;

  /** In Rial. */
  price: number;
  description: string | null;
  created_at: Date;
  updated_at: Date;
  client: AppointmentClientDto;
  service: AppointmentServiceDto;
}
