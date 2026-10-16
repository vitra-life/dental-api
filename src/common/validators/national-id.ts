import { applyDecorators } from '@nestjs/common';
import { ValidateBy } from 'class-validator';
import { DigitsToNull } from './transforms.js';

export function isValidNationalId(value: string): boolean {
  if (!/^\d{10}$/.test(value) || /^(\d)\1{9}$/.test(value)) return false;
  const digits = value.split('').map(Number);
  const sum = digits
    .slice(0, 9)
    .reduce((total, digit, i) => total + digit * (10 - i), 0);
  const remainder = sum % 11;
  const check = remainder < 2 ? remainder : 11 - remainder;
  return digits[9] === check;
}

export const IsNationalId = () =>
  applyDecorators(
    DigitsToNull(),
    ValidateBy({
      name: 'isNationalId',
      validator: {
        validate: (value) =>
          typeof value === 'string' && isValidNationalId(value),
        defaultMessage: () => '$property must be a valid 10-digit national id',
      },
    }),
  );
