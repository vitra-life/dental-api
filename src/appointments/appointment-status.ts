import { AppointmentStatus } from '../generated/prisma/enums.js';

/** Where each status may go next. Completed, cancelled and no-show are final. */
const transitions: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  pending: ['confirmed', 'completed', 'cancelled', 'no_show'],
  confirmed: ['completed', 'cancelled', 'no_show'],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function canChangeStatus(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  return transitions[from].includes(to);
}

/** Only appointments that have not happened yet can be edited. */
export function isEditable(status: AppointmentStatus): boolean {
  return status === 'pending' || status === 'confirmed';
}
