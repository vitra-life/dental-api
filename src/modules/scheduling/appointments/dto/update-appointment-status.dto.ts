import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { AppointmentStatus } from '../../../../generated/prisma/enums.js';

/** The statuses this endpoint sets; `pending` is only the starting state. */
export const CHANGEABLE_STATUSES = [
  'confirmed',
  'completed',
  'no_show',
] as const satisfies readonly AppointmentStatus[];

export class UpdateAppointmentStatusDto {
  /** Cancelling has its own endpoint, `POST /appointments/:id/cancel`. */
  @ApiProperty({ enum: CHANGEABLE_STATUSES })
  @IsIn(CHANGEABLE_STATUSES, {
    message: `status must be one of ${CHANGEABLE_STATUSES.join(', ')}`,
  })
  status: (typeof CHANGEABLE_STATUSES)[number];
}
