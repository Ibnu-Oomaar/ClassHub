import { Role } from '../../common/enums/role.enum';
import { MeView } from '../../users/types/user.types.interface';

/** Claims stored inside the JWT. Everything else is looked up from the database on each request. */
export interface JwtPayload {
  /** users.id */
  sub: string;
  role: Role;
  /** users.token_version at the time of issue. A newer version on the account revokes the token. */
  tv: number;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresAt: Date;
  user: MeView;
}

/** The same message for every failed sign-in, so responses never reveal which part was wrong. */
export const GENERIC_LOGIN_FAILURE =
  'Invalid credentials, or the account is unavailable or temporarily locked. Check your details and try again.';
