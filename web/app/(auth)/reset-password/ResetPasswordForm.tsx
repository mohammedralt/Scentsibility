'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    startTransition(async () => {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        router.push('/login?reset=1');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Something went wrong. Try again.');
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-4">
      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-950/30 text-red-400 text-sm border border-red-800">
          {error}{' '}
          {error.includes('expired') && (
            <Link href="/forgot-password" className="underline">Request a new link</Link>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">New password</label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
          placeholder="At least 8 characters"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm" className="text-sm font-medium">Confirm password</label>
        <input
          id="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="input"
        />
      </div>

      <button type="submit" disabled={isPending} className="btn-primary justify-center py-2.5 mt-1">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save new password'}
      </button>
    </form>
  );
}
