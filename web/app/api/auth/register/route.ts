import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getUserByEmail, createUser } from '@/lib/db';
import { rateLimit, clientIp } from '@/lib/rate-limit';

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
});

export async function POST(req: NextRequest) {
  if (!(await rateLimit(`register:ip:${clientIp(req.headers)}`, 5, 3600))) {
    return NextResponse.json({ error: 'Too many sign-ups from this network. Try again in an hour.' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request. Password must be at least 8 characters.' },
      { status: 400 }
    );
  }

  const { name, email, password } = parsed.data;

  const existing = await getUserByEmail(email);
  if (existing) {
    return NextResponse.json(
      { error: 'An account with that email already exists.' },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await createUser(email, passwordHash, name);

  return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
}
