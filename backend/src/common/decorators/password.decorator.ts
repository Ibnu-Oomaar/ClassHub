import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Password policy for Class Master and Teacher accounts (students have no password). */
export function StrongPassword() {
  return applyDecorators(
    IsString(),
    MinLength(8, { message: 'Password must be at least 8 characters.' }),
    MaxLength(128, { message: 'Password must be at most 128 characters.' }),
    Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'Password must contain at least one letter and one number.' }),
  );
}
