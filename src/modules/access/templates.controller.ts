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
  CreatePermissionTemplateDto,
  PermissionCodesDto,
  PermissionTemplateDto,
  UpdatePermissionTemplateDto,
} from './dto/template.dto.js';
import { TemplatesService } from './templates.service.js';

@ApiTags('permission templates')
@ClinicScoped()
@Controller('permission-templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @RequirePermission(P.templateView)
  @ApiOkResponse({ type: [PermissionTemplateDto] })
  list(@ClinicId() clinicId: string) {
    return this.templates.list(clinicId);
  }

  @Get(':id')
  @RequirePermission(P.templateView)
  @ApiOkResponse({ type: PermissionTemplateDto })
  get(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.templates.get(clinicId, id);
  }

  /** A new, empty template; set its items with `PUT /:id/permissions`. */
  @Post()
  @RequirePermission(P.templateCreate)
  @ApiCreatedResponse({ type: PermissionTemplateDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'The clinic already has a template with this code',
  })
  create(
    @CurrentMembership() member: MembershipContext,
    @Body() dto: CreatePermissionTemplateDto,
  ) {
    return this.templates.create(member, dto);
  }

  @Patch(':id')
  @RequirePermission(P.templateUpdate)
  @ApiOkResponse({ type: PermissionTemplateDto })
  update(
    @CurrentMembership() member: MembershipContext,
    @Param('id') id: string,
    @Body() dto: UpdatePermissionTemplateDto,
  ) {
    return this.templates.update(member, id, dto);
  }

  /** Replaces the template's items; you can only put in items you hold. */
  @Put(':id/permissions')
  @RequirePermission(P.templateUpdate)
  @ApiOkResponse({ type: PermissionTemplateDto })
  setPermissions(
    @CurrentMembership() member: MembershipContext,
    @CurrentPermissions() caller: ReadonlySet<string>,
    @Param('id') id: string,
    @Body() dto: PermissionCodesDto,
  ) {
    return this.templates.setPermissions(member, caller, id, dto.permissions);
  }

  /** Workspaces it was applied to keep their copies of its items. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(P.templateDelete)
  @ApiNoContentResponse()
  remove(
    @CurrentMembership() member: MembershipContext,
    @Param('id') id: string,
  ) {
    return this.templates.remove(member, id);
  }
}
