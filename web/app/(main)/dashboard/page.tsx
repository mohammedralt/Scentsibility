import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { Bell, BellOff, ExternalLink, TrendingDown, Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getUserWatchlist } from '@/lib/db';
import { formatPrice, formatDate, isStagedImage, canOptimizeImage } from '@/lib/utils';
import { RemoveWatchlistButton } from '@/components/RemoveWatchlistButton';

export const metadata: Metadata = { title: 'My Watchlist' };

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/login?callbackUrl=/dashboard');

  const userId = session.user.id as string;
  const watchlist = await getUserWatchlist(userId);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-baseline justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">My Watchlist</h1>
          <p className="text-sm text-gray-500 mt-1">
            You&apos;ll get an email when tracked prices drop below your threshold.
          </p>
        </div>
        <Link href="/search" className="btn-ghost text-sm">
          <Plus className="h-4 w-4" />
          Add fragrance
        </Link>
      </div>

      {watchlist.length === 0 ? (
        <div className="card p-12 text-center">
          <Bell className="h-10 w-10 text-gray-700 mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-1">No fragrances tracked yet</h2>
          <p className="text-sm text-gray-500 mb-6">
            Search for a fragrance and hit &ldquo;Track price&rdquo; to start monitoring deals.
          </p>
          <Link href="/search" className="btn-primary inline-flex">
            Browse fragrances
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {watchlist.map((item) => (
            <div key={item.id} className="card p-4 flex items-center gap-4">
              {/* Thumbnail */}
              <div className="relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gray-800 flex items-center justify-center">
                {item.fragrance_image ? (
                  <Image
                    src={item.fragrance_image}
                    unoptimized={!canOptimizeImage(item.fragrance_image)}
                    alt={item.fragrance_name}
                    fill
                    sizes="64px"
                    className={isStagedImage(item.fragrance_image) ? 'object-cover scale-125' : 'object-contain p-1'}
                  />
                ) : (
                  <span className="text-2xl">🌸</span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide">{item.fragrance_brand}</p>
                <Link
                  href={`/fragrance/${item.fragrance_id}`}
                  className="font-semibold text-sm hover:text-brand-400 truncate block"
                >
                  {item.fragrance_name}
                </Link>

                <div className="flex items-center gap-3 mt-1">
                  {item.cheapest_price ? (
                    <div className="flex items-center gap-1.5 text-sm">
                      <TrendingDown className="h-3.5 w-3.5 text-green-500" />
                      <span className="font-bold text-brand-400">
                        {formatPrice(item.cheapest_price, item.cheapest_currency!)}
                      </span>
                      <span className="text-gray-400 text-xs">at {item.cheapest_retailer}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 italic">No prices yet</span>
                  )}

                  {!item.notify_email && (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                      <BellOff className="h-3 w-3" />
                      Emails off
                    </span>
                  )}
                  {item.alert_threshold && (
                    <span className="badge badge-purple text-xs">
                      Alert at {formatPrice(item.alert_threshold, 'USD')}
                    </span>
                  )}
                </div>

                <p className="text-xs text-gray-400 mt-0.5">
                  Tracking since {formatDate(item.created_at)}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link
                  href={`/fragrance/${item.fragrance_id}`}
                  className="btn-ghost py-1.5 px-2.5 text-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View prices
                </Link>
                <RemoveWatchlistButton itemId={item.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
