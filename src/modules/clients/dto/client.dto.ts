import { ApiProperty } from '@nestjs/swagger';
import { Gender } from '../../../generated/prisma/enums.js';

export class ClientDto {
  id: string;
  clinic_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  national_id: string | null;

  @ApiProperty({ example: '1985-04-12', nullable: true, type: String })
  birth_date: string | null;

  @ApiProperty({ enum: Gender })
  gender: Gender;

  email: string | null;
  blood_type: string | null;
  address: string | null;
  allergies: string | null;
  medical_history: string | null;
  emergency_contact: string | null;
  emergency_phone: string | null;
  insurance_company: string | null;
  insurance_number: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;

  /** How many appointments the client has, in any status. */
  appointment_count: number;

  /** Start of the client's latest completed appointment. */
  last_visit: Date | null;
}

export class ClientPageDto {
  @ApiProperty({ type: [ClientDto] })
  items: ClientDto[];

  total: number;
  page: number;
  page_size: number;
}
