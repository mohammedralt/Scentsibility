import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetPasswordForm } from './ResetPasswordForm';

export const metadata: Metadata = { title: 'Choose a new password' };

export default function ResetPasswordPage({ searchParams }: { searchParams: { token?: string } }) {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">Choose a new password</h1>
        </div>
        {searchParams.token ? (
          <ResetPasswordForm token={searchParams.token} />
        ) : (
          <div className="card p-6 text-sm text-gray-300">
            This link is incomplete.{' '}
            <Link href="/forgot-password" className="text-brand-400 hover:underline">Request a new one</Link>.
          </div>
        )}
      </div>
    </div>
  );
}
