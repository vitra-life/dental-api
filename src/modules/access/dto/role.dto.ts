import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  PermissionKind,
  PermissionScope,
} from '../../../generated/prisma/enums.js';
import { Trim } from '../../../common/validators/transforms.js';

export class RoleGrantDto {
  /** A catalogue code, e.g. `appointments.booking.create`. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  code: string;

  /** Only matters for items that touch data; others are stored as `clinic`. */
  @ApiProperty({ enum: PermissionScope })
  @IsEnum(PermissionScope)
  scope: PermissionScope;
}

export class RoleDto {
  id: string;
  /** Null for system roles. */
  clinic_id: string | null;
  code: string;
  name: string;
  /** System roles are defined by the software and cannot be changed. */
  is_system: boolean;
  /** How many memberships of this clinic hold the role. */
  member_count: number;

  @ApiProperty({ type: [RoleGrantDto] })
  permissions: RoleGrantDto[];
}

export class CreateRoleDto {
  /** Lowercase letters, digits and `_`, e.g. `senior_secretary`. Unique in the clinic. */
  @ApiProperty({ example: 'senior_secretary' })
  @Trim()
  @Matches(/^[a-z][a-z0-9_]{1,63}$/, {
    message:
      'code must be lowercase letters, digits and _, starting with a letter',
  })
  code: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;
}

export class UpdateRoleDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;
}

export class SetRolePermissionsDto {
  /** The role's complete set of grants; replaces the current one. */
  @ApiProperty({ type: [RoleGrantDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => RoleGrantDto)
  permissions: RoleGrantDto[];
}

export class PermissionNodeDto {
  code: string;

  @ApiProperty({ enum: PermissionKind })
  kind: PermissionKind;

  /** Persian label. */
  label: string;
  description: string | null;
  /** Whether a grant of this item carries a scope. */
  scoped: boolean;

  @ApiProperty({ type: () => [PermissionNodeDto] })
  children: PermissionNodeDto[];
}

export class ReferenceItemDto {
  id: string;
  code: string;
  name: string;
}
