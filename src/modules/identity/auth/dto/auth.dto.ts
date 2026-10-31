import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { IsIranianMobile } from '../../../../common/validators/iranian-mobile.js';
import { IsUuid } from '../../../../common/validators/uuid.js';

export class LoginDto {
  @ApiProperty({ example: '09121234567' })
  @IsIranianMobile()
  mobile: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  refresh_token: string;
}

export class SwitchClinicDto {
  @IsUuid()
  clinic_id: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  current_password: string;

  /** At least 8 characters. */
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  new_password: string;
}
