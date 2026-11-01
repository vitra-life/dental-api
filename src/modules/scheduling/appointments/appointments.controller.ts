import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type {
  AccessContext,
  MembershipContext,
} from '../../../common/auth/auth-request.js';
import {
  CurrentAccess,
  CurrentMembership,
  RequirePermission,
} from '../../../common/auth/decorators.js';
import { P } from '../../../common/auth/permission-catalog.js';
import { ClinicScoped } from '../../../common/clinic/clinic-scoped.decorator.js';
import { ErrorResponseDto } from '../../../core/http/error-response.dto.js';
import { AppointmentsService } from './appointments.service.js';
import { AppointmentDto } from './dto/appointment.dto.js';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto.js';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto.js';
import { UpdateAppointmentDto } from './dto/update-appointment.dto.js';

@ApiTags('appointments')
@ClinicScoped()
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  /** Ordered by start time. Needs `from` and `to`, or `client_id`. Only what the caller's scope reaches. */
  @Get()
  @RequirePermission(P.appointmentsListView)
  @ApiOkResponse({ type: [AppointmentDto] })
  list(
    @CurrentMembership() member: MembershipContext,
    @CurrentAccess() access: AccessContext,
    @Query() query: ListAppointmentsQueryDto,
  ) {
    return this.appointments.list(member, access, query);
  }

  @Get(':id')
  @RequirePermission(P.appointmentsListView)
  @ApiOkResponse({ type: AppointmentDto })
  get(
    @CurrentMembership() member: MembershipContext,
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
  ) {
    return this.appointments.get(member, access, id);
  }

  /** Books a new appointment; it starts as `pending`. The doctor must be free and within the caller's scope. */
  @Post()
  @RequirePermission(P.appointmentsBookingCreate)
  @ApiCreatedResponse({ type: AppointmentDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'The doctor already has an appointment at this time',
  })
  create(
    @CurrentMembership() member: MembershipContext,
    @CurrentAccess() access: AccessContext,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.appointments.create(member, access, dto);
  }

  /** Edits or reschedules a pending or confirmed appointment. */
  @Patch(':id')
  @RequirePermission(P.appointmentsBookingUpdate)
  @ApiOkResponse({ type: AppointmentDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      'The appointment is completed, cancelled or no-show, or the doctor is busy then',
  })
  update(
    @CurrentMembership() member: MembershipContext,
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.appointments.update(member, access, id, dto);
  }

  /** pending → confirmed, completed or no_show; confirmed → completed or no_show. The rest are final. */
  @Patch(':id/status')
  @RequirePermission(P.appointmentsStatusChange)
  @ApiOkResponse({ type: AppointmentDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'The change is not allowed from the current status',
  })
  changeStatus(
    @CurrentMembership() member: MembershipContext,
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    return this.appointments.changeStatus(member, access, id, dto.status);
  }

  /** Cancels a pending or confirmed appointment. Recorded in the audit log. */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(P.appointmentsStatusCancel)
  @ApiOkResponse({ type: AppointmentDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'The appointment is already completed or cancelled',
  })
  cancel(
    @CurrentMembership() member: MembershipContext,
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
  ) {
    return this.appointments.cancel(member, access, id);
  }
}
