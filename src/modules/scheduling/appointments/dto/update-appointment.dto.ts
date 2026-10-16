import { PartialType } from '@nestjs/swagger';
import { CreateAppointmentDto } from './create-appointment.dto.js';

/**
 * Any field of a pending or confirmed appointment. If only `start_time` is
 * sent, `end_time` moves with it. Changing the service does not change the
 * price or end time; send those too if they should follow.
 */
// skipNullProperties: false, so `null` on a required field is rejected.
export class UpdateAppointmentDto extends PartialType(CreateAppointmentDto, {
  skipNullProperties: false,
}) {}
