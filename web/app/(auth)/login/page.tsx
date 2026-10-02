'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Loader2 } from 'lucide-react';
import { safeCallbackUrl } from '@/lib/utils';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    startTransition(async () => {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.code === 'rate_limited') {
        setError('Too many sign-in attempts. Try again in 15 minutes.');
      } else if (result?.error) {
        setError('Invalid email or password.');
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    });
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to your Scentsibility account</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-4">
          {searchParams.get('registered') && !error && (
            <div className="px-3 py-2 rounded-lg bg-green-950/30 text-green-400 text-sm border border-green-800">
              Account created. Sign in to continue.
            </div>
          )}
          {searchParams.get('reset') && !error && (
            <div className="px-3 py-2 rounded-lg bg-green-950/30 text-green-400 text-sm border border-green-800">
              Password changed. Sign in with your new password.
            </div>
          )}
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-950/30 text-red-400 text-sm border border-red-800">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@example.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <label htmlFor="password" className="text-sm font-medium">Password</label>
              <Link href="/forgot-password" className="text-xs text-gray-400 hover:text-brand-400">
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
            />
          </div>

          <button type="submit" disabled={isPending} className="btn-primary justify-center py-2.5 mt-1">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Don&apos;t have an account?{' '}
          <Link href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="text-brand-400 hover:underline font-medium">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
