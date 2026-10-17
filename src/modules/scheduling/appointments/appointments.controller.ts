import {
  Body,
  Controller,
  Get,
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
import { ClinicId } from '../../../common/clinic/clinic-id.decorator.js';
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

  /** Ordered by start time. Needs `from` and `to`, or `client_id`. */
  @Get()
  @ApiOkResponse({ type: [AppointmentDto] })
  list(@ClinicId() clinicId: string, @Query() query: ListAppointmentsQueryDto) {
    return this.appointments.list(clinicId, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: AppointmentDto })
  get(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.appointments.get(clinicId, id);
  }

  /** Books a new appointment; it starts as `pending`. */
  @Post()
  @ApiCreatedResponse({ type: AppointmentDto })
  create(@ClinicId() clinicId: string, @Body() dto: CreateAppointmentDto) {
    return this.appointments.create(clinicId, dto);
  }

  /** Edits or reschedules a pending or confirmed appointment. */
  @Patch(':id')
  @ApiOkResponse({ type: AppointmentDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'The appointment is completed, cancelled or no-show',
  })
  update(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.appointments.update(clinicId, id, dto);
  }

  /**
   * pending → confirmed, completed, cancelled or no_show;
   * confirmed → completed, cancelled or no_show. The rest are final.
   */
  @Patch(':id/status')
  @ApiOkResponse({ type: AppointmentDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'The change is not allowed from the current status',
  })
  changeStatus(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    return this.appointments.changeStatus(clinicId, id, dto.status);
  }
}
