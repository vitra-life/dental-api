import { applyDecorators, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiHeader,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../core/http/error-response.dto.js';
import { CLINIC_HEADER } from './clinic-request.js';
import { ClinicGuard } from './clinic.guard.js';

/** For controllers whose data belongs to one clinic. */
export const ClinicScoped = () =>
  applyDecorators(
    UseGuards(ClinicGuard),
    ApiHeader({
      name: CLINIC_HEADER,
      required: true,
      description:
        'Id of the clinic to act for. Temporary: it will come from the login token.',
    }),
    ApiBadRequestResponse({ type: ErrorResponseDto }),
    ApiNotFoundResponse({ type: ErrorResponseDto }),
  );
