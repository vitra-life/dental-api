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
import type {
  MembershipContext,
  WorkspaceContext,
} from '../../common/auth/auth-request.js';
import {
  CurrentMembership,
  CurrentPermissions,
  CurrentWorkspace,
  RequirePermission,
} from '../../common/auth/decorators.js';
import { P } from '../../common/auth/permission-catalog.js';
import { ClinicId } from '../../common/clinic/clinic-id.decorator.js';
import { ClinicScoped } from '../../common/clinic/clinic-scoped.decorator.js';
import { ErrorResponseDto } from '../../core/http/error-response.dto.js';
import { PermissionCodesDto } from '../access/dto/template.dto.js';
import {
  ApplyTemplateDto,
  CreatedStaffMemberDto,
  CreateStaffMemberDto,
  CreateWorkspaceDto,
  DoctorDto,
  PasswordResetDto,
  SetDoctorProfileDto,
  StaffMemberDto,
  UpdateStaffMemberDto,
  UpdateWorkspaceDto,
  WorkspaceDto,
} from './dto/staff.dto.js';
import { StaffService } from './staff.service.js';
import { WorkspacesService } from './workspaces.service.js';

const lastAdmin = {
  type: ErrorResponseDto,
  description:
    'Would leave the clinic without an active admin workspace (reason last_admin)',
};

@ApiTags('staff')
@ClinicScoped()
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  /** Every member of the clinic with staff types, workspaces and doctor profile. */
  @Get()
  @RequirePermission(P.staffView)
  @ApiOkResponse({ type: [StaffMemberDto] })
  list(@ClinicId() clinicId: string) {
    return this.staff.list(clinicId);
  }

  @Get(':membershipId')
  @RequirePermission(P.staffView)
  @ApiOkResponse({ type: StaffMemberDto })
  get(
    @ClinicId() clinicId: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.staff.get(clinicId, membershipId);
  }

  /**
   * Adds someone by mobile, with what they are (staff types) and their
   * positions; a doctor also gets their practice workspace. Every workspace
   * starts with no permissions. A new account gets a temporary password,
   * returned once in `temporary_password`.
   */
  @Post()
  @RequirePermission(P.staffCreate)
  @ApiCreatedResponse({ type: CreatedStaffMemberDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Already a member of the clinic',
  })
  create(
    @CurrentMembership() member: MembershipContext,
    @Body() dto: CreateStaffMemberDto,
  ) {
    return this.staff.create(member, dto);
  }

  /** Changes active state or staff types. */
  @Patch(':membershipId')
  @RequirePermission(P.staffUpdate)
  @ApiOkResponse({ type: StaffMemberDto })
  @ApiConflictResponse(lastAdmin)
  update(
    @CurrentMembership() member: MembershipContext,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateStaffMemberDto,
  ) {
    return this.staff.update(member, membershipId, dto);
  }

  /**
   * Gives the member a new temporary password, returned once, and signs them
   * out everywhere. Not for your own account, nor for someone who also
   * belongs to another clinic.
   */
  @Post(':membershipId/reset-password')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(P.staffResetPassword)
  @ApiOkResponse({ type: PasswordResetDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      'Your own account (reason self) or a member of another clinic (reason other_clinics)',
  })
  resetPassword(
    @CurrentMembership() member: MembershipContext,
    @Param('membershipId') membershipId: string,
  ) {
    return this.staff.resetPassword(member, membershipId);
  }

  @Put(':membershipId/doctor-profile')
  @RequirePermission(P.doctorProfileUpdate)
  @ApiOkResponse({ type: StaffMemberDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'The medical license number is already used',
  })
  setDoctorProfile(
    @CurrentMembership() member: MembershipContext,
    @Param('membershipId') membershipId: string,
    @Body() dto: SetDoctorProfileDto,
  ) {
    return this.staff.setDoctorProfile(member, membershipId, dto);
  }
}

@ApiTags('staff')
@ClinicScoped()
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  /** Every position in the clinic, with its holder and grants. */
  @Get()
  @RequirePermission(P.staffView)
  @ApiOkResponse({ type: [WorkspaceDto] })
  list(@ClinicId() clinicId: string) {
    return this.workspaces.list(clinicId);
  }

  /**
   * Adds a position for a member: staff of a doctor, or clinic-wide. It
   * starts with no permissions. Only an admin can create an admin workspace.
   */
  @Post()
  @RequirePermission(P.workspaceCreate)
  @ApiCreatedResponse({ type: WorkspaceDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      'The person already holds this position (reason duplicate_workspace)',
  })
  create(
    @CurrentMembership() member: MembershipContext,
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Body() dto: CreateWorkspaceDto,
  ) {
    return this.workspaces.create(member, workspace, dto);
  }

  @Patch(':id')
  @RequirePermission(P.workspaceUpdate)
  @ApiOkResponse({ type: WorkspaceDto })
  @ApiConflictResponse(lastAdmin)
  update(
    @CurrentMembership() member: MembershipContext,
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('id') id: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspaces.update(member, workspace, id, dto);
  }

  /** Replaces the workspace's grants; you can only grant items you hold. */
  @Put(':id/permissions')
  @RequirePermission(P.workspaceUpdate)
  @ApiOkResponse({ type: WorkspaceDto })
  setPermissions(
    @CurrentMembership() member: MembershipContext,
    @CurrentPermissions() caller: ReadonlySet<string>,
    @Param('id') id: string,
    @Body() dto: PermissionCodesDto,
  ) {
    return this.workspaces.setPermissions(member, caller, id, dto.permissions);
  }

  /** Adds a template's items to the workspace's grants. */
  @Post(':id/apply-template')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(P.workspaceUpdate)
  @ApiOkResponse({ type: WorkspaceDto })
  applyTemplate(
    @CurrentMembership() member: MembershipContext,
    @CurrentPermissions() caller: ReadonlySet<string>,
    @Param('id') id: string,
    @Body() dto: ApplyTemplateDto,
  ) {
    return this.workspaces.applyTemplate(member, caller, id, dto.template_id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(P.workspaceDelete)
  @ApiNoContentResponse()
  @ApiConflictResponse(lastAdmin)
  remove(
    @CurrentMembership() member: MembershipContext,
    @Param('id') id: string,
  ) {
    return this.workspaces.remove(member, id);
  }
}

@ApiTags('staff')
@ClinicScoped()
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly staff: StaffService) {}

  /** The doctors the active workspace can book for: its own doctor, or all of the clinic's. */
  @Get()
  @RequirePermission(P.appointmentView, P.appointmentCreate)
  @ApiOkResponse({ type: [DoctorDto] })
  list(@CurrentWorkspace() workspace: WorkspaceContext) {
    return this.staff.doctors(workspace);
  }
}
