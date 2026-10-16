import { PartialType } from '@nestjs/swagger';
import { CreateServiceDto } from './create-service.dto.js';

// skipNullProperties: false, so `null` on a required field is rejected.
export class UpdateServiceDto extends PartialType(CreateServiceDto, {
  skipNullProperties: false,
}) {}
