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
  Put,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { PermissionScope } from '../../generated/prisma/enums.js';
import type { MembershipContext } from '../../common/auth/auth-request.js';
import {
  CurrentMembership,
  CurrentPermissions,
  RequirePermission,
} from '../../common/auth/decorators.js';
import { P } from '../../common/auth/permission-catalog.js';
import { ClinicId } from '../../common/clinic/clinic-id.decorator.js';
import { ClinicScoped } from '../../common/clinic/clinic-scoped.decorator.js';
import { ErrorResponseDto } from '../../core/http/error-response.dto.js';
import {
  CreateRoleDto,
  RoleDto,
  SetRolePermissionsDto,
  UpdateRoleDto,
} from './dto/role.dto.js';
import { RolesService } from './roles.service.js';

@ApiTags('roles')
@ClinicScoped()
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  /** The system roles and the clinic's own roles. */
  @Get()
  @RequirePermission(P.rolesView)
  @ApiOkResponse({ type: [RoleDto] })
  list(@ClinicId() clinicId: string) {
    return this.roles.list(clinicId);
  }

  @Get(':id')
  @RequirePermission(P.rolesView)
  @ApiOkResponse({ type: RoleDto })
  get(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.roles.get(clinicId, id);
  }

  /** Creates a custom role for this clinic, without permissions. */
  @Post()
  @RequirePermission(P.rolesManage)
  @ApiCreatedResponse({ type: RoleDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'The clinic already has a role with this code',
  })
  create(
    @CurrentMembership() member: MembershipContext,
    @Body() dto: CreateRoleDto,
  ) {
    return this.roles.create(member, dto);
  }

  /** Renames a custom role. System roles cannot be changed. */
  @Patch(':id')
  @RequirePermission(P.rolesManage)
  @ApiOkResponse({ type: RoleDto })
  update(
    @CurrentMembership() member: MembershipContext,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.roles.update(member, id, dto);
  }

  /** Deletes a custom role nobody holds. */
  @Delete(':id')
  @RequirePermission(P.rolesManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'The role is assigned to members',
  })
  remove(
    @CurrentMembership() member: MembershipContext,
    @Param('id') id: string,
  ) {
    return this.roles.remove(member, id);
  }

  /** Replaces a custom role's permissions. You can only grant what you hold, at your scope or narrower. */
  @Put(':id/permissions')
  @RequirePermission(P.rolesManage)
  @ApiOkResponse({ type: RoleDto })
  setPermissions(
    @CurrentMembership() member: MembershipContext,
    @CurrentPermissions() caller: Map<string, PermissionScope>,
    @Param('id') id: string,
    @Body() dto: SetRolePermissionsDto,
  ) {
    return this.roles.setPermissions(member, caller, id, dto.permissions);
  }
}
