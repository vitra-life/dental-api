import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { Trim } from '../../../common/validators/transforms.js';

export class PermissionTemplateDto {
  id: string;
  code: string;
  name: string;
  /** Catalogue codes, in catalogue order. */
  permissions: string[];
}

export class CreatePermissionTemplateDto {
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

export class UpdatePermissionTemplateDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;
}

/** A complete set of permission codes; replaces the current one. */
export class PermissionCodesDto {
  @ApiProperty({ example: ['appointment.view', 'appointment.create'] })
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  permissions: string[];
}

export class PermissionItemDto {
  /** e.g. `appointment.create` */
  code: string;
  label: string;
  description: string | null;
}

export class PermissionGroupDto {
  /** e.g. `appointments` */
  code: string;
  label: string;
  @ApiProperty({ type: [PermissionItemDto] })
  items: PermissionItemDto[];
}

export class ReferenceItemDto {
  id: string;
  code: string;
  name: string;
}
