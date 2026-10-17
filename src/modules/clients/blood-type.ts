import { IsIn } from 'class-validator';

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const IsBloodType = () =>
  IsIn(BLOOD_TYPES, {
    message: `$property must be one of ${BLOOD_TYPES.join(', ')}`,
  });
