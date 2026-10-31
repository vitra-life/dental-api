import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthRequest } from '../auth/auth-request.js';

/** The id of the active clinic. Needs `@ClinicScoped()`. */
export const ClinicId = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const clinicId = context.switchToHttp().getRequest<AuthRequest>().clinic_id;
    if (!clinicId)
      throw new Error(
        'request.clinic_id is not set; is the route @ClinicScoped()?',
      );
    return clinicId;
  },
);
