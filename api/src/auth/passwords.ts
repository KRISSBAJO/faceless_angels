import { BadRequestException } from '@nestjs/common';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

export const MIN_PASSWORD_LENGTH = 10;

// Long enough to pass the length rule, and still the first ones an attacker tries.
const COMMON = new Set([
  'password12345',
  'password1234',
  'password123456',
  'passwordpassword',
  '1234567890',
  '12345678910',
  '0123456789',
  'qwertyuiop',
  'qwerty12345',
  'qwerty123456',
  'iloveyou123',
  'letmein12345',
  'welcome12345',
  'admin123456',
  'administrator',
  'changeme123',
  'abcdefghij',
  '1q2w3e4r5t',
  '1qaz2wsx3edc',
]);

/** Throws with a plain message when a new password is too weak. */
export function assertAcceptablePassword(password: string, email: string) {
  const lower = password.toLowerCase();
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new BadRequestException(
      `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) {
    throw new BadRequestException(
      'That password is too common. Choose one that is harder to guess.',
    );
  }
  const name = email.split('@')[0].toLowerCase();
  if (name.length >= 4 && lower.includes(name)) {
    throw new BadRequestException(
      'Choose a password that does not contain your email name.',
    );
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scrypt(
    password,
    Buffer.from(salt, 'base64'),
    expected.length,
  );
  return timingSafeEqual(actual, expected);
}
