import type { Request } from 'express';

/** Until login exists, the clinic is named by this header. */
export const CLINIC_HEADER = 'x-clinic-id';

/** A request that passed `ClinicGuard`. */
export interface ClinicRequest extends Request {
  clinic_id: string;
}
