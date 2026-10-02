import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { getUserByEmail } from './db';
import { z } from 'zod';
import { rateLimit, clientIp } from './rate-limit';

class RateLimited extends CredentialsSignin {
  code = 'rate_limited';
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.email = user.email as string;
        token.name = user.name ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name ?? null;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        // Slow down password guessing: per account, and per address across accounts
        const allowed =
          (await rateLimit(`login:email:${parsed.data.email}`, 10, 900)) &&
          (await rateLimit(`login:ip:${clientIp(request.headers)}`, 30, 900));
        if (!allowed) throw new RateLimited();

        const user = await getUserByEmail(parsed.data.email);
        if (!user) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.password_hash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.display_name ?? null };
      },
    }),
  ],
});
