import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Gender } from '../../../generated/prisma/enums.js';
import { BLOOD_TYPES, IsBloodType } from '../blood-type.js';
import { IsPastDate } from '../../../common/validators/dates.js';
import { IsIranianMobile } from '../../../common/validators/iranian-mobile.js';
import { IsNationalId } from '../../../common/validators/national-id.js';
import { Trim, TrimToNull } from '../../../common/validators/transforms.js';

export class CreateClientDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  first_name: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  last_name: string;

  /** Mobile number, unique within the clinic. */
  @ApiProperty({ example: '09121234567' })
  @IsIranianMobile()
  phone: string;

  @ApiProperty({ enum: Gender })
  @IsEnum(Gender)
  gender: Gender;

  /** کد ملی */
  @ApiPropertyOptional({ example: '0012345679', nullable: true })
  @IsOptional()
  @IsNationalId()
  national_id?: string | null;

  @ApiPropertyOptional({ example: '1985-04-12', nullable: true })
  @IsOptional()
  @TrimToNull()
  @IsPastDate()
  birth_date?: string | null;

  @IsOptional()
  @TrimToNull()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @ApiPropertyOptional({ enum: BLOOD_TYPES, nullable: true })
  @IsOptional()
  @TrimToNull()
  @IsBloodType()
  blood_type?: string | null;

  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(1000)
  address?: string | null;

  /** Free text, entries separated by a comma or "،". */
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(5000)
  allergies?: string | null;

  /** Free text, entries separated by a comma or "،". */
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(5000)
  medical_history?: string | null;

  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(255)
  emergency_contact?: string | null;

  @ApiPropertyOptional({ example: '09121234567', nullable: true })
  @IsOptional()
  @IsIranianMobile()
  emergency_phone?: string | null;

  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(255)
  insurance_company?: string | null;

  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(50)
  insurance_number?: string | null;

  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;
}
