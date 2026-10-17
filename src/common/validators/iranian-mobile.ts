import { applyDecorators } from '@nestjs/common';
import { Matches } from 'class-validator';
import { DigitsToNull } from './transforms.js';

export const IRANIAN_MOBILE = /^09\d{9}$/;

export const IsIranianMobile = () =>
  applyDecorators(
    DigitsToNull(),
    Matches(IRANIAN_MOBILE, {
      message: '$property must be a mobile number like 09121234567',
    }),
  );
