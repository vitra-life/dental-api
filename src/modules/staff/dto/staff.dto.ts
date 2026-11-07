import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { WorkspaceKind } from '../../../generated/prisma/enums.js';
import { IsIranianMobile } from '../../../common/validators/iranian-mobile.js';
import { IsOptionalNonNull } from '../../../common/validators/optional.js';
import { Trim, TrimToNull } from '../../../common/validators/transforms.js';
import { IsUuid } from '../../../common/validators/uuid.js';

export class DoctorProfileDto {
  medical_license: string;
  specialty: string | null;
  license_verified: boolean;
}

/** A position of a person in the clinic, with its grants. */
export class WorkspaceDto {
  id: string;
  membership_id: string;
  /** The person holding it. */
  member_name: string;
  @ApiProperty({ enum: WorkspaceKind })
  kind: WorkspaceKind;
  /** The doctor whose data it sees; null for clinic-wide ones. */
  doctor_membership_id: string | null;
  doctor_name: string | null;
  /** For staff workspaces: secretary_of, assistant_of, ... */
  relationship_type: string | null;
  /** Holds every permission, including ones added later. */
  is_admin: boolean;
  is_active: boolean;
  /** e.g. «مدیر کلینیک», «مطب خودم», «دستیار پزشک: دکتر الف» */
  label: string;
  /** Granted catalogue codes (every code for an admin workspace). */
  permissions: string[];
}

export class StaffMemberDto {
  membership_id: string;
  user_id: string;
  full_name: string;
  mobile: string;
  is_active: boolean;
  joined_at: Date;
  /** What the person is: doctor, secretary, assistant. */
  staff_types: string[];

  @ApiProperty({ type: [WorkspaceDto] })
  workspaces: WorkspaceDto[];

  @ApiPropertyOptional({ type: DoctorProfileDto, nullable: true })
  doctor_profile: DoctorProfileDto | null;
}

export class CreatedStaffMemberDto extends StaffMemberDto {
  /**
   * Only when a new user account was created: the temporary password, shown
   * this once. The user must change it at first login.
   */
  temporary_password: string | null;
}

const STAFF_TYPES_FIELD = {
  each: true,
  message:
    'each staff type must be a code such as doctor, secretary or assistant',
};

/** A position to create: a staff position for a doctor, or a clinic-wide one. */
export class NewPositionDto {
  @ApiProperty({ enum: ['staff', 'clinic'] })
  @IsIn(['staff', 'clinic'])
  kind: 'staff' | 'clinic';

  /** Required for `staff`: the doctor the person works for. */
  @IsOptional()
  @IsUuid()
  doctor_membership_id?: string;

  /** Required for `staff`, e.g. `assistant_of`. */
  @ApiPropertyOptional({ example: 'assistant_of' })
  @IsOptional()
  @Matches(/^[a-z_]{2,64}$/, {
    message: 'relationship_type must be a code such as secretary_of',
  })
  relationship_type?: string;
}

export class CreateStaffMemberDto {
  /** Used only when no user has this mobile yet. */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  full_name: string;

  @ApiProperty({ example: '09121234567' })
  @IsIranianMobile()
  mobile: string;

  /** A doctor also gets their own practice workspace. */
  @ApiProperty({ example: ['secretary'] })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @Matches(/^[a-z_]{2,64}$/, STAFF_TYPES_FIELD)
  staff_types: string[];

  /** Further positions, e.g. assistant of Dr A. Each starts with no permissions. */
  @ApiPropertyOptional({ type: [NewPositionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => NewPositionDto)
  positions?: NewPositionDto[];
}

export class UpdateStaffMemberDto {
  @IsOptionalNonNull()
  @IsBoolean()
  is_active?: boolean;

  /** Replaces the current set. Adding doctor creates their practice workspace. */
  @IsOptionalNonNull()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @Matches(/^[a-z_]{2,64}$/, STAFF_TYPES_FIELD)
  staff_types?: string[];
}

export class PasswordResetDto {
  /** Shown this once; the user must change it at first login. */
  temporary_password: string;
}

export class SetDoctorProfileDto {
  /** شماره نظام پزشکی; unique across all doctors. */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  medical_license: string;

  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(255)
  specialty?: string | null;

  @IsOptionalNonNull()
  @IsBoolean()
  license_verified?: boolean;
}

export class DoctorDto {
  membership_id: string;
  full_name: string;
  specialty: string | null;
}

export class CreateWorkspaceDto extends NewPositionDto {
  @IsUuid()
  membership_id: string;

  /** Clinic-wide only, and only an admin can create another admin. */
  @IsOptionalNonNull()
  @IsBoolean()
  is_admin?: boolean;
}

export class UpdateWorkspaceDto {
  @IsOptionalNonNull()
  @IsBoolean()
  is_active?: boolean;

  /** Clinic-wide workspaces only; only an admin can change it. */
  @IsOptionalNonNull()
  @IsBoolean()
  is_admin?: boolean;
}

export class ApplyTemplateDto {
  @IsUuid()
  template_id: string;
}
