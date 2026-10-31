/** The lengths an appointment can be booked for, in minutes. */
export const APPOINTMENT_DURATIONS = [20, 30, 45, 60, 90, 120] as const;

export const DEFAULT_DURATION = 30;

/** The service's usual length if it is one of the bookable durations, else 30 minutes. */
export function defaultDuration(serviceMinutes: number): number {
  return (APPOINTMENT_DURATIONS as readonly number[]).includes(serviceMinutes)
    ? serviceMinutes
    : DEFAULT_DURATION;
}
