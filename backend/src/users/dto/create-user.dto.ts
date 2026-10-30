import { CreateUserInput } from '../types/user.types.interface';

/**
 * Internal shape used by the students, teachers and setup features when they create the login
 * account that belongs to a profile. Accounts are never created through a public endpoint:
 * the HTTP-facing DTOs of those features carry the validation rules.
 */
export type CreateUserDto = CreateUserInput;
