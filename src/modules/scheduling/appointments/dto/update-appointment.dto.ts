import { PartialType } from '@nestjs/swagger';
import { CreateAppointmentDto } from './create-appointment.dto.js';

/**
 * Any field of a pending or confirmed appointment. Changing the service does
 * not change the duration; send `duration_minutes` too if it should follow.
 */
// skipNullProperties: false, so `null` on a required field is rejected.
export class UpdateAppointmentDto extends PartialType(CreateAppointmentDto, {
  skipNullProperties: false,
}) {}
