import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsDateTimeWithZone } from '../../../../common/validators/dates.js';
import { IsOptionalNonNull } from '../../../../common/validators/optional.js';
import { TrimToNull } from '../../../../common/validators/transforms.js';
import { IsUuid } from '../../../../common/validators/uuid.js';
import { APPOINTMENT_DURATIONS } from '../appointment-duration.js';

export class CreateAppointmentDto {
  @IsUuid()
  client_id: string;

  /** Must be an active service of the clinic. */
  @IsUuid()
  service_id: string;

  /** The chosen date at the chosen time. */
  @ApiProperty({ example: '2026-10-14T10:00:00+03:30' })
  @IsDateTimeWithZone()
  start_time: string;

  /** Defaults to the service's `duration_minutes` if that is one of the allowed values, else 30. */
  @ApiPropertyOptional({ enum: APPOINTMENT_DURATIONS, example: 30 })
  @IsOptionalNonNull()
  @IsIn(APPOINTMENT_DURATIONS, {
    message: `duration_minutes must be one of ${APPOINTMENT_DURATIONS.join(', ')}`,
  })
  duration_minutes?: number;

  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(5000)
  description?: string | null;
}
