import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ClinicRequest } from './clinic-request.js';

export const ClinicId = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<ClinicRequest>().clinic_id,
);
