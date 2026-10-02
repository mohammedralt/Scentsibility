import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserByEmail } from '@/lib/db';
import { createResetToken } from '@/lib/tokens';
import { sendEmail } from '@/lib/email';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { SITE_URL } from '@/lib/site';

const schema = z.object({ email: z.string().trim().toLowerCase().email() });

// Same answer whether or not the account exists, so this can't be used to
// find out who has signed up.
const OK = { message: 'If an account exists for that email, a reset link is on its way.' };

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  const { email } = parsed.data;

  const allowed =
    (await rateLimit(`forgot:ip:${clientIp(req.headers)}`, 10, 3600)) &&
    (await rateLimit(`forgot:email:${email}`, 3, 3600));
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Try again in an hour.' }, { status: 429 });
  }

  const user = await getUserByEmail(email);
  if (!user) return NextResponse.json(OK);

  const link = `${SITE_URL}/reset-password?token=${createResetToken(user.id, user.password_hash)}`;
  try {
    await sendEmail({
      to: user.email,
      subject: 'Reset your Scentsibility password',
      html: `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#0e0d0c;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#f2f0ed">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#1c1a18;border:1px solid #2b2724;border-radius:16px">
    <tr><td style="padding:28px">
      <p style="margin:0 0 20px;font-weight:700;font-size:18px;color:#e4c47f">Scentsibility</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5">Someone asked to reset the password for this account. The link works for one hour.</p>
      <a href="${link}" style="display:inline-block;background:#e4c47f;color:#0e0d0c;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px">Choose a new password</a>
      <p style="margin:20px 0 0;font-size:12px;color:#7d766f">If this wasn't you, ignore this email. Your password won't change.</p>
    </td></tr>
  </table>
</body></html>`,
    });
  } catch (err) {
    // Still answer OK: a different reply here would reveal that the account exists
    console.error('Password reset email failed', err);
  }

  return NextResponse.json(OK);
}
