import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getUserById, updatePassword } from '@/lib/db';
import { readResetToken, verifyResetToken } from '@/lib/tokens';
import { rateLimit, clientIp } from '@/lib/rate-limit';

const schema = z.object({
  token: z.string().min(1).max(512),
  password: z.string().min(8).max(128),
});

const EXPIRED = { error: 'This reset link has expired or was already used. Request a new one.' };

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }
  if (!(await rateLimit(`reset:ip:${clientIp(req.headers)}`, 20, 3600))) {
    return NextResponse.json({ error: 'Too many attempts. Try again in an hour.' }, { status: 429 });
  }

  const { token, password } = parsed.data;
  const claimed = readResetToken(token);
  const user = claimed ? await getUserById(claimed.userId) : null;
  if (!user || !verifyResetToken(token, user.password_hash)) {
    return NextResponse.json(EXPIRED, { status: 400 });
  }

  await updatePassword(user.id, await bcrypt.hash(password, 12));
  return NextResponse.json({ ok: true });
}
