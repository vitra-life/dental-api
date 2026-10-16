import { ApiProperty } from '@nestjs/swagger';
import { ServiceCategory } from '../../generated/prisma/enums.js';

export class ServiceDto {
  id: string;
  clinic_id: string;
  name: string;

  @ApiProperty({ enum: ServiceCategory })
  category: ServiceCategory;

  /** In Rial. */
  default_price: number;
  duration_minutes: number;
  description: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}
