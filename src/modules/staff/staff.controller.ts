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
  CreatedStaffMemberDto,
  CreateStaffAssignmentDto,
  CreateStaffMemberDto,
  DoctorDto,
  SetDoctorProfileDto,
  StaffAssignmentDto,
  StaffMemberDto,
  UpdateStaffMemberDto,
} from './dto/staff.dto.js';
import { StaffAssignmentsService } from './staff-assignments.service.js';
import { StaffService } from './staff.service.js';

@ApiTags('staff')
@ClinicScoped()
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  /** Every member of the clinic with staff types, roles and doctor profile. */
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
   * Adds someone by mobile. A new account gets a temporary password, returned
   * once in `temporary_password`; they must change it at first login.
   */
  @Post()
  @RequirePermission(P.staffManage)
  @ApiCreatedResponse({ type: CreatedStaffMemberDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Already a member of the clinic',
  })
  create(
    @CurrentMembership() member: MembershipContext,
    @CurrentPermissions() caller: Map<string, PermissionScope>,
    @Body() dto: CreateStaffMemberDto,
  ) {
    return this.staff.create(member, caller, dto);
  }

  /** Changes active state, staff types or roles. The clinic always keeps one active admin. */
  @Patch(':membershipId')
  @RequirePermission(P.staffManage)
  @ApiOkResponse({ type: StaffMemberDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Would leave the clinic without an active admin',
  })
  update(
    @CurrentMembership() member: MembershipContext,
    @CurrentPermissions() caller: Map<string, PermissionScope>,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateStaffMemberDto,
  ) {
    return this.staff.update(member, caller, membershipId, dto);
  }

  @Put(':membershipId/doctor-profile')
  @RequirePermission(P.staffManage)
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
@Controller('staff-assignments')
export class StaffAssignmentsController {
  constructor(private readonly assignments: StaffAssignmentsService) {}

  @Get()
  @RequirePermission(P.staffView)
  @ApiOkResponse({ type: [StaffAssignmentDto] })
  list(@ClinicId() clinicId: string) {
    return this.assignments.list(clinicId);
  }

  /** Assigns a staff member to a doctor, e.g. as their secretary. */
  @Post()
  @RequirePermission(P.staffManage)
  @ApiCreatedResponse({ type: StaffAssignmentDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'The assignment already exists',
  })
  create(
    @CurrentMembership() member: MembershipContext,
    @Body() dto: CreateStaffAssignmentDto,
  ) {
    return this.assignments.create(member, dto);
  }

  @Delete(':id')
  @RequirePermission(P.staffManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(
    @CurrentMembership() member: MembershipContext,
    @Param('id') id: string,
  ) {
    return this.assignments.remove(member, id);
  }
}

@ApiTags('staff')
@ClinicScoped()
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly staff: StaffService) {}

  /** The clinic's active doctors, for the booking form. Any member may read it. */
  @Get()
  @ApiOkResponse({ type: [DoctorDto] })
  list(@ClinicId() clinicId: string) {
    return this.staff.doctors(clinicId);
  }
}
