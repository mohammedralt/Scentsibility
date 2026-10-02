import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Password reset links carry a signed token instead of a stored one. The
 * signature covers the user's current password hash, so a link stops working
 * as soon as it has been used (or the password changes any other way).
 */
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not set');
  return s;
}

function sign(payload: string, passwordHash: string): string {
  return createHmac('sha256', secret()).update(`reset:${payload}:${passwordHash}`).digest('base64url');
}

export function createResetToken(userId: string, passwordHash: string): string {
  const payload = `${userId}.${Date.now() + RESET_TTL_MS}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload, passwordHash)}`;
}

/** The user id inside a token, before its signature is checked. */
export function readResetToken(token: string): { userId: string; expires: number } | null {
  const [encoded] = token.split('.');
  const [userId, expires] = Buffer.from(encoded ?? '', 'base64url').toString().split('.');
  if (!userId || !expires || !Number.isFinite(Number(expires))) return null;
  return { userId, expires: Number(expires) };
}

export function verifyResetToken(token: string, passwordHash: string): boolean {
  const parsed = readResetToken(token);
  if (!parsed || parsed.expires < Date.now()) return false;
  const given = Buffer.from(token.split('.')[1] ?? '');
  const expected = Buffer.from(sign(`${parsed.userId}.${parsed.expires}`, passwordHash));
  return given.length === expected.length && timingSafeEqual(given, expected);
}
