import * as argon2 from 'argon2';

const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB, OWASP-recommended minimum for argon2id
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

let dummyHashPromise: Promise<string> | null = null;

/**
 * Verifies against a throw-away hash so a login for an unknown account takes about as long
 * as a login for a real account (prevents user enumeration through response timing).
 */
export async function burnPasswordCheck(plain: string): Promise<void> {
  dummyHashPromise ??= hashPassword('classhub-timing-equaliser');
  await verifyPassword(await dummyHashPromise, plain);
}
