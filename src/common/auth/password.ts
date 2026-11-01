import { randomInt } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

/** argon2id with the library's defaults (memory-hard; a few tens of ms per check). */
export const hashPassword = (password: string) => hash(password);

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** A 12-character temporary password without look-alike characters (0/O, 1/l/I). */
export function temporaryPassword(length = 12): string {
  return Array.from(
    { length },
    () => ALPHABET[randomInt(ALPHABET.length)],
  ).join('');
}
