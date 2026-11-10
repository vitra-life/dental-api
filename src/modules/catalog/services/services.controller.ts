import {
  Body,
  Controller,
  Delete,
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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { MembershipContext } from '../../../common/auth/auth-request.js';
import {
  CurrentMembership,
  RequirePermission,
} from '../../../common/auth/decorators.js';
import { P } from '../../../common/auth/permission-catalog.js';
import { ClinicId } from '../../../common/clinic/clinic-id.decorator.js';
import { ClinicScoped } from '../../../common/clinic/clinic-scoped.decorator.js';
import { ErrorResponseDto } from '../../../core/http/error-response.dto.js';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { ListServicesQueryDto } from './dto/list-services-query.dto.js';
import { ServiceDto } from './dto/service.dto.js';
import { UpdateServiceDto } from './dto/update-service.dto.js';
import { ServicesService } from './services.service.js';
import { ParseIdPipe } from '../../../common/validators/parse-id.pipe.js';

@ApiTags('services')
@ClinicScoped()
@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  /** The clinic's whole service catalogue, ordered by name. Booking needs it, so viewing or booking appointments is enough. */
  @Get()
  @RequirePermission(P.serviceView, P.appointmentView, P.appointmentCreate)
  @ApiOkResponse({ type: [ServiceDto] })
  list(@ClinicId() clinicId: string, @Query() query: ListServicesQueryDto) {
    return this.services.list(clinicId, query);
  }

  @Get(':id')
  @RequirePermission(P.serviceView, P.appointmentView, P.appointmentCreate)
  @ApiOkResponse({ type: ServiceDto })
  get(@ClinicId() clinicId: string, @Param('id', ParseIdPipe) id: string) {
    return this.services.get(clinicId, id);
  }

  @Post()
  @RequirePermission(P.serviceCreate)
  @ApiCreatedResponse({ type: ServiceDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'The clinic already has a service with this name',
  })
  create(@ClinicId() clinicId: string, @Body() dto: CreateServiceDto) {
    return this.services.create(clinicId, dto);
  }

  @Patch(':id')
  @RequirePermission(P.serviceUpdate)
  @ApiOkResponse({ type: ServiceDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'The clinic already has a service with this name',
  })
  update(
    @ClinicId() clinicId: string,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.services.update(clinicId, id, dto);
  }

  @Delete(':id')
  @RequirePermission(P.serviceDelete)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'The service has appointments; deactivate it instead',
  })
  remove(
    @CurrentMembership() member: MembershipContext,
    @Param('id', ParseIdPipe) id: string,
  ) {
    return this.services.remove(member, id);
  }
}
