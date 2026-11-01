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
import type {
  AccessContext,
  MembershipContext,
} from '../../common/auth/auth-request.js';
import {
  CurrentAccess,
  CurrentMembership,
  RequirePermission,
} from '../../common/auth/decorators.js';
import { P } from '../../common/auth/permission-catalog.js';
import { ClinicScoped } from '../../common/clinic/clinic-scoped.decorator.js';
import { ErrorResponseDto } from '../../core/http/error-response.dto.js';
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

  /** Newest first, with optional search. Only the clients the caller's scope reaches. */
  @Get()
  @RequirePermission(P.clientsListView)
  @ApiOkResponse({ type: ClientPageDto })
  list(
    @CurrentMembership() member: MembershipContext,
    @CurrentAccess() access: AccessContext,
    @Query() query: ListClientsQueryDto,
  ) {
    return this.clients.list(member, access, query);
  }

  @Get(':id')
  @RequirePermission(P.clientsRecordView)
  @ApiOkResponse({ type: ClientDto })
  get(
    @CurrentMembership() member: MembershipContext,
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
  ) {
    return this.clients.get(member, access, id);
  }

  @Post()
  @RequirePermission(P.clientsRecordCreate)
  @ApiCreatedResponse({ type: ClientDto })
  @ApiConflictResponse(duplicatePhone)
  create(
    @CurrentMembership() member: MembershipContext,
    @Body() dto: CreateClientDto,
  ) {
    return this.clients.create(member, dto);
  }

  @Patch(':id')
  @RequirePermission(P.clientsRecordUpdate)
  @ApiOkResponse({ type: ClientDto })
  @ApiConflictResponse(duplicatePhone)
  update(
    @CurrentMembership() member: MembershipContext,
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clients.update(member, access, id, dto);
  }
}
