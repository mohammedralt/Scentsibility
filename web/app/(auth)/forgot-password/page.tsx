'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    startTransition(async () => {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSent(data.message);
      else setError(data.error ?? 'Something went wrong. Try again.');
    });
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">Forgot your password?</h1>
          <p className="text-sm text-gray-500 mt-1">We&apos;ll email you a link to choose a new one.</p>
        </div>

        {sent ? (
          <div className="card p-6 text-sm text-gray-300">
            <p>{sent}</p>
            <p className="text-gray-500 mt-3">Check your spam folder if it doesn&apos;t arrive in a few minutes.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-4">
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

            <button type="submit" disabled={isPending} className="btn-primary justify-center py-2.5 mt-1">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-gray-500 mt-4">
          <Link href="/login" className="text-brand-400 hover:underline font-medium">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
