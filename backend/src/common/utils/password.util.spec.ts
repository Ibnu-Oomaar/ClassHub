import { burnPasswordCheck, hashPassword, verifyPassword } from './password.util';

describe('password utilities', () => {
  it('hashes with argon2id and never stores the password', async () => {
    const hash = await hashPassword('Secret123');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('Secret123');
  });

  it('salts every hash, so the same password gives different hashes', async () => {
    expect(await hashPassword('Secret123')).not.toBe(await hashPassword('Secret123'));
  });

  it('accepts the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('Secret123');
    expect(await verifyPassword(hash, 'Secret123')).toBe(true);
    expect(await verifyPassword(hash, 'secret123')).toBe(false);
    expect(await verifyPassword(hash, '')).toBe(false);
  });

  it('treats a damaged hash as a failed check instead of throwing', async () => {
    expect(await verifyPassword('not-a-hash', 'Secret123')).toBe(false);
    expect(await verifyPassword('', 'Secret123')).toBe(false);
  });

  it('can spend the same effort for an unknown account', async () => {
    await expect(burnPasswordCheck('anything')).resolves.toBeUndefined();
  });
});
