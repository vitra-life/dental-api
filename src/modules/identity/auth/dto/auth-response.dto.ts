import { ApiProperty } from '@nestjs/swagger';
import { PermissionScope } from '../../../../generated/prisma/enums.js';

export class MeRoleDto {
  id: string;
  code: string;
  name: string;
  is_system: boolean;
}

export class MeClinicDto {
  clinic_id: string;
  clinic_name: string;
  membership_id: string;
  roles: MeRoleDto[];
  /** Codes, e.g. doctor, secretary. */
  staff_types: string[];
}

export class MePermissionDto {
  /** A catalogue code, e.g. `appointments.booking.create`. */
  code: string;

  @ApiProperty({ enum: PermissionScope })
  scope: PermissionScope;
}

export class MeUserDto {
  id: string;
  full_name: string;
  mobile: string;
  /** While true, only `me`, `change-password` and `logout` work. */
  must_change_password: boolean;
}

export class MeDto {
  user: MeUserDto;
  /** The clinics the user is an active member of. */
  clinics: MeClinicDto[];
  /** Null until the user chooses a clinic (or has only one). */
  active_clinic_id: string | null;
  /** Effective permissions in the active clinic; empty without one. */
  permissions: MePermissionDto[];
}

export class AccessTokenDto {
  access_token: string;
  token_type: string;
  /** Seconds until the access token expires. */
  expires_in: number;
}

export class TokensDto extends AccessTokenDto {
  /** Exchange at `POST /auth/refresh`; replaced on every use. */
  refresh_token: string;
  me: MeDto;
}
