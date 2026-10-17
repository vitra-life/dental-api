import { PartialType } from '@nestjs/swagger';
import { CreateClientDto } from './create-client.dto.js';

// skipNullProperties: false, so `null` on a required field is rejected.
export class UpdateClientDto extends PartialType(CreateClientDto, {
  skipNullProperties: false,
}) {}
