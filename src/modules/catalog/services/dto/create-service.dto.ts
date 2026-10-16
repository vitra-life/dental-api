import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ServiceCategory } from '../../../../generated/prisma/enums.js';
import { IsOptionalNonNull } from '../../../../common/validators/optional.js';
import { Trim, TrimToNull } from '../../../../common/validators/transforms.js';
import { MAX_RIAL } from '../../../../common/validators/money.js';

export class CreateServiceDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ enum: ServiceCategory, default: 'general' })
  @IsOptionalNonNull()
  @IsEnum(ServiceCategory)
  category?: ServiceCategory;

  /** Default price in Rial. */
  @IsOptionalNonNull()
  @IsInt()
  @Min(0)
  @Max(MAX_RIAL)
  default_price?: number;

  /** Usual length of an appointment for this service. */
  @IsOptionalNonNull()
  @IsInt()
  @Min(5)
  @Max(480)
  duration_minutes?: number;

  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  /** Inactive services cannot be booked. */
  @IsOptionalNonNull()
  @IsBoolean()
  active?: boolean;
}
