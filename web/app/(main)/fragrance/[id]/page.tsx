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
import { formatPrice, timeAgo, formatSize, isStagedImage, canOptimizeImage } from '@/lib/utils';
import { rankListings, summarizeListings, isAvailable, type ListingKind } from '@/lib/listings';
import type { TrackedProduct } from '@/lib/types';

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const fragrance = await getFragranceById(params.id);
  if (!fragrance) return { title: 'Fragrance not found' };
  return {
    title: `${fragrance.brand} ${fragrance.name} — Price Comparison`,
    description: `Compare prices for ${fragrance.brand} ${fragrance.name} across multiple retailers.`,
    alternates: { canonical: `/fragrance/${fragrance.id}` },
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

  // Full bottles first, samples/decants last, so a $3 decant never headlines.
  // Sold-out listings are folded away so the page leads with what you can buy.
  const ranked = rankListings(prices);
  const summary = summarizeListings(prices);
  const available = ranked.filter((r) => isAvailable(r.listing));
  const soldOutListings = ranked.filter((r) => !isAvailable(r.listing));
  const bottles = available.filter((r) => r.kind !== 'sample').map((r) => r.listing);
  const bestValue = summary.soldOut ? null : summary.cheapest;
  // Cheapest per ml among in-stock bottles with a known size, when that's a different listing
  const perMl = (p: (typeof prices)[number]) => Number(p.last_price) / p.size_ml!;
  const bestPerMlCandidate = bottles.filter((p) => p.size_ml).sort((a, b) => perMl(a) - perMl(b))[0];
  const bestPerMl = bestPerMlCandidate && bestPerMlCandidate.id !== bestValue?.id ? bestPerMlCandidate : null;
  const firstSampleId = available.find((r) => r.kind === 'sample')?.listing.id;
  // Most recent scrape across all listings (prices[] is sorted by price, not time)
  const lastUpdated = prices.reduce<string | null>(
    (latest, p) => (p.last_scraped_at && (!latest || p.last_scraped_at > latest) ? p.last_scraped_at : latest),
    null
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-400 mb-6 flex items-center gap-1.5">
        <Link href="/" className="hover:text-gray-200">Home</Link>
        <span>/</span>
        <Link href="/search" className="hover:text-gray-200">Fragrances</Link>
        <span>/</span>
        <span className="text-gray-200">{fragrance.brand} {fragrance.name}</span>
      </nav>

      {/* Product header */}
      <div className="flex gap-6 mb-8 items-start">
        {/* Image */}
        <div
          className={`relative flex-shrink-0 w-36 sm:w-56 aspect-[4/4.4] rounded-2xl border border-gray-800 overflow-hidden flex items-center justify-center ${
            isStagedImage(fragrance.image_url) ? 'bg-black' : 'bg-gray-900'
          }`}
        >
          {fragrance.image_url ? (
            <Image
              src={fragrance.image_url}
              unoptimized={!canOptimizeImage(fragrance.image_url)}
              alt={`${fragrance.brand} ${fragrance.name}`}
              fill
              sizes="224px"
              className={isStagedImage(fragrance.image_url) ? 'object-cover' : 'object-contain p-4'}
              priority
            />
          ) : (
            <span className="text-5xl select-none">🌸</span>
          )}
        </div>

        {/* Meta */}
        <div className="flex-1">
          <p className="text-sm text-brand-400 font-medium uppercase tracking-wide mb-0.5">{fragrance.brand}</p>
          <h1 className="text-2xl font-bold text-gray-50 mb-2">{fragrance.name}</h1>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            {fragrance.fragrance_type && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-800 text-gray-300">
                {fragrance.fragrance_type}
              </span>
            )}
            {summary.soldOut ? (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-950/60 text-red-300 border border-red-900">
                SOLD OUT
              </span>
            ) : summary.goodDeal && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold border border-brand-700 text-brand-300">
                Good Deal
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
          <div className="rounded-xl border border-gray-800 p-10 text-center text-gray-400">
            No prices tracked yet for this fragrance.
          </div>
        ) : (
          <>
            {summary.soldOut && (
              <div className="mb-4 rounded-xl border border-red-900/70 bg-red-950/30 px-4 py-4">
                <p className="font-semibold text-red-300">Sold out everywhere</p>
                <p className="text-sm text-gray-400 mt-0.5">
                  None of the {new Set(prices.map((p) => p.retailer_key)).size} stores we track have a full bottle in stock
                  {summary.cheapest?.last_price != null && (
                    <> — last seen from {formatPrice(Number(summary.cheapest.last_price), summary.cheapest.currency)}</>
                  )}
                  . Track it to get an email when a new low price shows up.
                </p>
              </div>
            )}

            {available.length > 0 && (
              <div className="flex flex-col gap-2">
                {available.map(({ listing: p, kind }) => (
                  <Fragment key={p.id}>
                    {p.id === firstSampleId && (
                      <p className="mt-4 mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Samples &amp; decants
                      </p>
                    )}
                    <ListingRow listing={p} kind={kind} bestValue={p.id === bestValue?.id} bestPerMl={p.id === bestPerMl?.id} />
                  </Fragment>
                ))}
              </div>
            )}

            {soldOutListings.length > 0 && (
              <details className="mt-4 group" open={available.length === 0}>
                <summary className="cursor-pointer list-none text-sm text-gray-400 hover:text-gray-200 select-none">
                  <span className="group-open:hidden">Show</span>
                  <span className="hidden group-open:inline">Hide</span>
                  {' '}{soldOutListings.length} sold-out {soldOutListings.length === 1 ? 'listing' : 'listings'}
                </summary>
                <div className="flex flex-col gap-2 mt-3 opacity-60">
                  {soldOutListings.map(({ listing: p, kind }) => (
                    <ListingRow key={p.id} listing={p} kind={kind} />
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </section>

      {/* Price history */}
      {history.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-200 mb-3">Price history (90 days)</h2>
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <PriceHistoryChart data={history} />
          </div>
        </section>
      )}
    </div>
  );
}

function ListingRow({
  listing: p,
  kind,
  bestValue = false,
  bestPerMl = false,
}: {
  listing: TrackedProduct;
  kind: ListingKind;
  bestValue?: boolean;
  bestPerMl?: boolean;
}) {
  const pricePml = p.last_price && p.size_ml ? (p.last_price / p.size_ml).toFixed(2) : null;
  const sizeText = p.variant_label
    ?? (p.size_ml ? formatSize(p.size_ml) : kind === 'sample' ? 'Sample / decant' : 'Size not listed');
  const soldOut = !isAvailable(p);

  return (
    <div
      className={`flex items-center gap-3 sm:gap-4 rounded-xl border px-3 sm:px-4 py-3.5 ${
        bestValue ? 'border-brand-800 bg-brand-950/40' : 'border-gray-800 bg-gray-900'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-50 text-sm">{p.retailer_name}</span>
          {bestValue && (
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-brand-600 text-white">BEST VALUE</span>
          )}
          {bestPerMl && (
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-500 text-white">BEST PER ML</span>
          )}
          {soldOut && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-800 text-gray-400">Sold out</span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">{sizeText}</p>
      </div>

      <div className="flex-shrink-0 text-right sm:mr-4">
        <p className={`font-bold ${soldOut ? 'text-gray-400 line-through' : 'text-gray-50'}`}>
          {formatPrice(p.last_price!, p.currency)}
        </p>
        {pricePml && <p className="text-xs text-gray-400">${pricePml}/ml</p>}
      </div>

      <a
        href={p.product_url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`View at ${p.retailer_name}`}
        className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
          soldOut ? 'border border-gray-700 text-gray-300 hover:bg-gray-800' : 'bg-brand-600 hover:bg-brand-700 text-white'
        }`}
      >
        {soldOut ? 'View' : <>View<span className="hidden sm:inline"> deal</span></>}
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
