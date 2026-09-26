import { Fragment } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ExternalLink, Clock } from 'lucide-react';
import {
  getFragranceById,
  getFragrancePrices,
  getAllPriceHistoryForFragrance,
  getWatchlistItem,
} from '@/lib/db';
import { auth } from '@/lib/auth';
import { PriceHistoryChart } from '@/components/PriceHistoryChart';
import { WatchlistButton } from '@/components/WatchlistButton';
import { formatPrice, timeAgo, formatSize } from '@/lib/utils';
import { rankListings } from '@/lib/listings';

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const fragrance = await getFragranceById(params.id);
  if (!fragrance) return { title: 'Fragrance not found' };
  return {
    title: `${fragrance.brand} ${fragrance.name} — Price Comparison`,
    description: `Compare prices for ${fragrance.brand} ${fragrance.name} across multiple retailers.`,
  };
}

export default async function FragrancePage({ params }: PageProps) {
  const [fragrance, prices, session] = await Promise.all([
    getFragranceById(params.id),
    getFragrancePrices(params.id),
    auth(),
  ]);

  if (!fragrance) notFound();

  const history = await getAllPriceHistoryForFragrance(fragrance.id, 90);
  const userId = session?.user?.id as string | undefined;
  const watchItem = userId ? await getWatchlistItem(userId, fragrance.id) : null;

  // Full bottles first, samples/decants last, so a $3 decant never headlines
  const ranked = rankListings(prices);
  const cheapest = ranked[0]?.listing ?? null;
  const bottles = ranked.filter((r) => r.kind !== 'sample').map((r) => r.listing);
  const bestValue = bottles.find((p) => p.last_in_stock) ?? bottles[0] ?? null;
  // Cheapest per ml among bottles with a known size, when that's a different listing
  const perMl = (p: (typeof prices)[number]) => Number(p.last_price) / p.size_ml!;
  const bestPerMlCandidate = bottles
    .filter((p) => p.size_ml && p.last_in_stock)
    .sort((a, b) => perMl(a) - perMl(b))[0];
  const bestPerMl = bestPerMlCandidate && bestPerMlCandidate.id !== bestValue?.id ? bestPerMlCandidate : null;
  const firstSampleId = ranked.find((r) => r.kind === 'sample')?.listing.id;
  // Most recent scrape across all listings (prices[] is sorted by price, not time)
  const lastUpdated = prices.reduce<string | null>(
    (latest, p) => (p.last_scraped_at && (!latest || p.last_scraped_at > latest) ? p.last_scraped_at : latest),
    null
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-400 mb-6 flex items-center gap-1.5">
        <Link href="/" className="hover:text-gray-600">Home</Link>
        <span>/</span>
        <Link href="/search" className="hover:text-gray-600">Fragrances</Link>
        <span>/</span>
        <span className="text-gray-700">{fragrance.brand} {fragrance.name}</span>
      </nav>

      {/* Product header */}
      <div className="flex gap-6 mb-8 items-start">
        {/* Image */}
        <div className="flex-shrink-0 w-28 h-28 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-center overflow-hidden">
          {fragrance.image_url ? (
            <Image
              src={fragrance.image_url}
              alt={`${fragrance.brand} ${fragrance.name}`}
              width={112}
              height={112}
              className="object-contain p-2"
            />
          ) : (
            <span className="text-4xl select-none">🌸</span>
          )}
        </div>

        {/* Meta */}
        <div className="flex-1">
          <p className="text-sm text-brand-600 font-medium uppercase tracking-wide mb-0.5">{fragrance.brand}</p>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{fragrance.name}</h1>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            {fragrance.fragrance_type && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                {fragrance.fragrance_type}
              </span>
            )}
            {cheapest && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-600 text-white">
                GOOD DEAL
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <WatchlistButton
              fragranceId={fragrance.id}
              isWatching={!!watchItem}
              watchlistItemId={watchItem?.id}
              alertThreshold={watchItem?.alert_threshold ?? null}
              isLoggedIn={!!session}
            />
          </div>
        </div>
      </div>

      {/* Price comparison */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Prices</span>
            <span className="ml-2 text-sm text-gray-400">{prices.length} {prices.length === 1 ? 'result' : 'results'}</span>
          </div>
          {lastUpdated && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Updated {timeAgo(lastUpdated)}
            </span>
          )}
        </div>

        {prices.length === 0 ? (
          <div className="rounded-xl border border-gray-200 p-10 text-center text-gray-400">
            No prices tracked yet for this fragrance.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {ranked.map(({ listing: p, kind }) => {
              const pricePml = p.last_price && p.size_ml
                ? (p.last_price / p.size_ml).toFixed(2)
                : null;
              const isBestValue = p.id === bestValue?.id;
              const isBestPerMl = p.id === bestPerMl?.id;
              const sizeText = p.variant_label
                ?? (p.size_ml ? formatSize(p.size_ml) : kind === 'sample' ? 'Sample / decant' : 'Size not listed');

              return (
                <Fragment key={p.id}>
                {p.id === firstSampleId && (
                  <p className="mt-4 mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Samples &amp; decants
                  </p>
                )}
                <div
                  className={`flex items-center gap-4 rounded-xl border px-4 py-3.5 ${
                    isBestValue
                      ? 'border-brand-200 bg-brand-50/40'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  {/* Retailer */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{p.retailer_name}</span>
                      {isBestValue && (
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-brand-600 text-white">
                          BEST VALUE
                        </span>
                      )}
                      {isBestPerMl && (
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-500 text-white">
                          BEST PER ML
                        </span>
                      )}
                      {p.last_in_stock === false && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                          Out of stock
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{sizeText}</p>
                  </div>

                  {/* Price */}
                  <div className="flex-shrink-0 text-right mr-4">
                    <p className="font-bold text-gray-900">
                      {formatPrice(p.last_price!, p.currency)}
                    </p>
                    {pricePml && (
                      <p className="text-xs text-gray-400">${pricePml}/ml</p>
                    )}
                  </div>

                  {/* View deal */}
                  <a
                    href={p.product_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    View deal
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
                </Fragment>
              );
            })}
          </div>
        )}
      </section>

      {/* Price history */}
      {history.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Price history (90 days)</h2>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <PriceHistoryChart data={history} />
          </div>
        </section>
      )}
    </div>
  );
}
