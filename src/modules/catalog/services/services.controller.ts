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
import { RequirePermission } from '../../../common/auth/decorators.js';
import { P } from '../../../common/auth/permission-catalog.js';
import { ClinicId } from '../../../common/clinic/clinic-id.decorator.js';
import { ClinicScoped } from '../../../common/clinic/clinic-scoped.decorator.js';
import { ErrorResponseDto } from '../../../core/http/error-response.dto.js';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { ListServicesQueryDto } from './dto/list-services-query.dto.js';
import { ServiceDto } from './dto/service.dto.js';
import { UpdateServiceDto } from './dto/update-service.dto.js';
import { ServicesService } from './services.service.js';

@ApiTags('services')
@ClinicScoped()
@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  /** The clinic's whole service catalogue, ordered by name. Any member may read it (booking needs it). */
  @Get()
  @ApiOkResponse({ type: [ServiceDto] })
  list(@ClinicId() clinicId: string, @Query() query: ListServicesQueryDto) {
    return this.services.list(clinicId, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ServiceDto })
  get(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.services.get(clinicId, id);
  }

  @Post()
  @RequirePermission(P.servicesManage)
  @ApiCreatedResponse({ type: ServiceDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'The clinic already has a service with this name',
  })
  create(@ClinicId() clinicId: string, @Body() dto: CreateServiceDto) {
    return this.services.create(clinicId, dto);
  }

  @Patch(':id')
  @RequirePermission(P.servicesManage)
  @ApiOkResponse({ type: ServiceDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'The clinic already has a service with this name',
  })
  update(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.services.update(clinicId, id, dto);
  }

  @Delete(':id')
  @RequirePermission(P.servicesManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'The service has appointments; deactivate it instead',
  })
  remove(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.services.remove(clinicId, id);
  }
}
