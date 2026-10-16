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
import { ClinicId } from '../common/clinic/clinic-id.decorator.js';
import { ClinicScoped } from '../common/clinic/clinic-scoped.decorator.js';
import { ErrorResponseDto } from '../common/dto/error-response.dto.js';
import { ClientsService } from './clients.service.js';
import { ClientDto, ClientPageDto } from './dto/client.dto.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { ListClientsQueryDto } from './dto/list-clients-query.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';

const duplicatePhone = {
  type: ErrorResponseDto,
  description: 'The clinic already has a client with this phone number',
};

@ApiTags('clients')
@ClinicScoped()
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  /** Newest first, with optional search. */
  @Get()
  @ApiOkResponse({ type: ClientPageDto })
  list(@ClinicId() clinicId: string, @Query() query: ListClientsQueryDto) {
    return this.clients.list(clinicId, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ClientDto })
  get(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.clients.get(clinicId, id);
  }

  @Post()
  @ApiCreatedResponse({ type: ClientDto })
  @ApiConflictResponse(duplicatePhone)
  create(@ClinicId() clinicId: string, @Body() dto: CreateClientDto) {
    return this.clients.create(clinicId, dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: ClientDto })
  @ApiConflictResponse(duplicatePhone)
  update(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clients.update(clinicId, id, dto);
  }
}
