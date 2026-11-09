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
import type {
  MembershipContext,
  WorkspaceContext,
} from '../../common/auth/auth-request.js';
import {
  CurrentMembership,
  CurrentWorkspace,
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
import { ParseIdPipe } from '../../common/validators/parse-id.pipe.js';

const duplicatePhone = {
  type: ErrorResponseDto,
  description: 'The clinic already has a client with this phone number',
};

@ApiTags('clients')
@ClinicScoped()
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  /**
   * Newest first, with optional search. Only the clients the workspace sees:
   * a doctor's workspace sees that doctor's clients, a clinic-wide one all.
   */
  @Get()
  @RequirePermission(P.clientView)
  @ApiOkResponse({ type: ClientPageDto })
  list(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Query() query: ListClientsQueryDto,
  ) {
    return this.clients.list(workspace, query);
  }

  @Get(':id')
  @RequirePermission(P.clientView)
  @ApiOkResponse({ type: ClientDto })
  get(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('id', ParseIdPipe) id: string,
  ) {
    return this.clients.get(workspace, id);
  }

  @Post()
  @RequirePermission(P.clientCreate)
  @ApiCreatedResponse({ type: ClientDto })
  @ApiConflictResponse(duplicatePhone)
  create(
    @CurrentMembership() member: MembershipContext,
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Body() dto: CreateClientDto,
  ) {
    return this.clients.create(member, workspace, dto);
  }

  @Patch(':id')
  @RequirePermission(P.clientUpdate)
  @ApiOkResponse({ type: ClientDto })
  @ApiConflictResponse(duplicatePhone)
  update(
    @CurrentMembership() member: MembershipContext,
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clients.update(member, workspace, id, dto);
  }

  /** Hides the client and cancels their upcoming appointments (soft delete). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(P.clientDelete)
  @ApiNoContentResponse()
  remove(
    @CurrentMembership() member: MembershipContext,
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('id', ParseIdPipe) id: string,
  ) {
    return this.clients.remove(member, workspace, id);
  }
}
