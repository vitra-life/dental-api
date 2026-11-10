import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { fieldError } from '../http/errors.js';
import { UUID_PATTERN } from './uuid.js';

/**
 * For id path parameters: a malformed id is a 400 for that parameter rather
 * than a lookup that can only answer 404. Use as `@Param('id', ParseIdPipe)`.
 */
@Injectable()
export class ParseIdPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (!UUID_PATTERN.test(value)) {
      const name = metadata.data ?? 'id';
      throw fieldError(name, `${name} must be a UUID`);
    }
    return value;
  }
}
