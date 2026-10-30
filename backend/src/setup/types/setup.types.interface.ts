import { UserView } from '../../users/types/user.types.interface';

export interface SetupStatus {
  /** True once the first Class Master exists and the class has been configured. */
  setupCompleted: boolean;
  className: string;
}

export interface SetupResult {
  className: string;
  classMaster: UserView;
}

/** Arbitrary constant: every setup attempt serializes on this PostgreSQL advisory lock. */
export const SETUP_ADVISORY_LOCK_KEY = 7_203_300_001;
