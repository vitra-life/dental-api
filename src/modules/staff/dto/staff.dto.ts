import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { IsIranianMobile } from '../../../common/validators/iranian-mobile.js';
import { IsOptionalNonNull } from '../../../common/validators/optional.js';
import { Trim, TrimToNull } from '../../../common/validators/transforms.js';
import { IsUuid, UUID_PATTERN } from '../../../common/validators/uuid.js';

const EACH_UUID = { each: true, message: 'each role id must be a UUID' };

export class StaffRoleDto {
  id: string;
  code: string;
  name: string;
  is_system: boolean;
}

export class DoctorProfileDto {
  medical_license: string;
  specialty: string | null;
  license_verified: boolean;
}

export class StaffMemberDto {
  membership_id: string;
  user_id: string;
  full_name: string;
  mobile: string;
  is_active: boolean;
  joined_at: Date;
  /** Codes: doctor, secretary, assistant. */
  staff_types: string[];

  @ApiProperty({ type: [StaffRoleDto] })
  roles: StaffRoleDto[];

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

  @ApiProperty({ example: ['secretary'] })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @Matches(/^[a-z_]{2,64}$/, STAFF_TYPES_FIELD)
  staff_types: string[];

  /** System roles or this clinic's roles. */
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @Matches(UUID_PATTERN, EACH_UUID)
  role_ids: string[];
}

export class UpdateStaffMemberDto {
  @IsOptionalNonNull()
  @IsBoolean()
  is_active?: boolean;

  /** Replaces the current set. */
  @IsOptionalNonNull()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @Matches(/^[a-z_]{2,64}$/, STAFF_TYPES_FIELD)
  staff_types?: string[];

  /** Replaces the current set. */
  @IsOptionalNonNull()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @Matches(UUID_PATTERN, EACH_UUID)
  role_ids?: string[];
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

export class StaffAssignmentDto {
  id: string;
  staff_membership_id: string;
  staff_name: string;
  doctor_membership_id: string;
  doctor_name: string;
  /** e.g. secretary_of */
  relationship_type: string;
  relationship_name: string;
  is_active: boolean;
  created_at: Date;
}

export class CreateStaffAssignmentDto {
  @IsUuid()
  staff_membership_id: string;

  @IsUuid()
  doctor_membership_id: string;

  @ApiProperty({ example: 'secretary_of' })
  @Matches(/^[a-z_]{2,64}$/, {
    message: 'relationship_type must be a code such as secretary_of',
  })
  relationship_type: string;
}
