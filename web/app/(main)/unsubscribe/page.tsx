import type { Metadata } from 'next';
import Link from 'next/link';
import { BellOff } from 'lucide-react';
import { getUnsubscribeItem } from '@/lib/db';

export const metadata: Metadata = { title: 'Email alerts', robots: { index: false } };

// Unsubscribing takes a button press, not just opening the link, because
// email scanners open links in advance and would unsubscribe people by accident.
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: { item?: string; done?: string };
}) {
  const item = searchParams.item ? await getUnsubscribeItem(searchParams.item) : null;
  const name = item ? `${item.fragrance_brand} ${item.fragrance_name}` : null;

  return (
    <div className="max-w-md mx-auto px-4 py-20">
      <div className="card p-8 text-center">
        <BellOff className="h-10 w-10 text-gray-600 mx-auto mb-4" />

        {!item ? (
          <>
            <h1 className="text-xl font-bold mb-2">Link not recognised</h1>
            <p className="text-sm text-gray-400">
              You can turn alerts off by removing fragrances from{' '}
              <Link href="/dashboard" className="text-brand-400 hover:underline">your watchlist</Link>.
            </p>
          </>
        ) : searchParams.done ? (
          <>
            <h1 className="text-xl font-bold mb-2">You&apos;re unsubscribed</h1>
            <p className="text-sm text-gray-400">
              {searchParams.done === 'all'
                ? "You won't get any more price alert emails."
                : `You won't get any more emails about ${name}.`}{' '}
              Set a price alert again on any fragrance to turn its emails back on.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold mb-2">Stop price alert emails?</h1>
            <p className="text-sm text-gray-400 mb-6">
              Fragrances stay on your watchlist either way.
            </p>
            <form action="/api/unsubscribe" method="POST" className="flex flex-col gap-3">
              <input type="hidden" name="item" value={searchParams.item} />
              <button type="submit" name="scope" value="one" className="btn-primary justify-center py-2.5">
                Stop emails about {name}
              </button>
              <button type="submit" name="scope" value="all" className="btn-ghost justify-center py-2.5 border border-gray-700">
                Stop all price alert emails
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
