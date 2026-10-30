import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';

/** Restricts a route (or controller) to the listed roles. Enforced by RolesGuard on the backend. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
