import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsDateTimeWithZone } from '../../common/validators/dates.js';
import { MAX_RIAL } from '../../common/validators/money.js';
import { IsOptionalNonNull } from '../../common/validators/optional.js';
import { TrimToNull } from '../../common/validators/transforms.js';
import { IsUuid } from '../../common/validators/uuid.js';

export class CreateAppointmentDto {
  @IsUuid()
  client_id: string;

  /** Must be an active service of the clinic. */
  @IsUuid()
  service_id: string;

  @ApiProperty({ example: '2026-10-14T09:30:00+03:30' })
  @IsDateTimeWithZone()
  start_time: string;

  /** Defaults to `start_time` plus the service's `duration_minutes`. */
  @ApiPropertyOptional({ example: '2026-10-14T10:00:00+03:30' })
  @IsOptionalNonNull()
  @IsDateTimeWithZone()
  end_time?: string;

  /** In Rial. Defaults to the service's `default_price`. */
  @IsOptionalNonNull()
  @IsInt()
  @Min(0)
  @Max(MAX_RIAL)
  price?: number;

  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(5000)
  description?: string | null;
}
