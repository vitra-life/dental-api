import { ApiProperty } from '@nestjs/swagger';
import { WorkspaceKind } from '../../../../generated/prisma/enums.js';

/** One position of the user in a clinic, to pick after login. */
export class MeWorkspaceDto {
  id: string;
  @ApiProperty({ enum: WorkspaceKind })
  kind: WorkspaceKind;
  /** The doctor whose data the workspace sees; null for clinic-wide ones. */
  doctor_membership_id: string | null;
  doctor_name: string | null;
  /** For staff workspaces: secretary_of, assistant_of, ... */
  relationship_type: string | null;
  is_admin: boolean;
  /** e.g. «مدیر کلینیک», «مطب خودم», «دستیار پزشک: دکتر الف» */
  label: string;
}

export class MeClinicDto {
  clinic_id: string;
  clinic_name: string;
  membership_id: string;
  /** Codes, e.g. doctor, secretary. */
  staff_types: string[];
  /** The user's active workspaces in this clinic. */
  workspaces: MeWorkspaceDto[];
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
  /** The clinics the user has an active workspace in. */
  clinics: MeClinicDto[];
  /** Null until the user chooses a workspace (or has only one). */
  active_workspace_id: string | null;
  /** The active workspace's clinic, or null. */
  active_clinic_id: string | null;
  /** The active workspace's permission codes, e.g. `appointment.create`; empty without one. */
  permissions: string[];
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

export class WorkspaceSwitchDto extends AccessTokenDto {
  me: MeDto;
}
