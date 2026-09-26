import Link from 'next/link';
import Image from 'next/image';
import type { Fragrance, TrackedProduct } from '@/lib/types';
import { formatPrice, formatSize, isStagedImage } from '@/lib/utils';

interface Props {
  fragrance: Fragrance;
  cheapest: TrackedProduct | null;
  soldOut?: boolean;
  storeCount: number;
  allPrices: TrackedProduct[];
}

function isGoodDeal(cheapest: TrackedProduct | null, all: TrackedProduct[]): boolean {
  if (!cheapest?.last_price || all.length < 2) return false;
  const avg = all.reduce((s, p) => s + Number(p.last_price ?? 0), 0) / all.length;
  return Number(cheapest.last_price) < avg * 0.88;
}

export function FragranceListItem({ fragrance, cheapest, soldOut = false, storeCount, allPrices }: Props) {
  const goodDeal = !soldOut && isGoodDeal(cheapest, allPrices);
  const pricePml =
    cheapest?.last_price && cheapest?.size_ml
      ? (cheapest.last_price / cheapest.size_ml).toFixed(2)
      : null;

  return (
    <Link
      href={`/fragrance/${fragrance.id}`}
      className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-xl px-4 py-4 hover:border-gray-600 transition-all duration-150"
    >
      {/* Thumbnail */}
      <div className="relative flex-shrink-0 w-16 h-16 bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center border border-gray-800">
        {fragrance.image_url ? (
          <Image
            src={fragrance.image_url}
            alt={`${fragrance.brand} ${fragrance.name}`}
            fill
            sizes="64px"
            className={isStagedImage(fragrance.image_url) ? 'object-cover scale-125' : 'object-contain p-1'}
          />
        ) : (
          <span className="text-2xl select-none">🌸</span>
        )}
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{fragrance.brand}</p>
        <p className="font-semibold text-gray-50 truncate">{fragrance.name}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {(cheapest?.variant_label || cheapest?.size_ml) && (
            <span className="text-xs text-gray-500">
              {cheapest.variant_label ?? formatSize(cheapest.size_ml)}
            </span>
          )}
          {soldOut && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-950/60 text-red-300 border border-red-900">
              Sold out
            </span>
          )}
          {goodDeal && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-brand-700 bg-brand-950/60 text-brand-300">
              Good Deal
            </span>
          )}
          {cheapest?.is_tester && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-950/50 text-amber-300 border border-amber-900">
              Tester
            </span>
          )}
        </div>
      </div>

      {/* Price */}
      <div className="flex-shrink-0 text-right">
        {cheapest?.last_price ? (
          <>
            <p className="text-lg font-bold text-gray-50">
              {formatPrice(cheapest.last_price, cheapest.currency)}
            </p>
            {pricePml && (
              <p className="text-xs text-gray-400">${pricePml}/ml</p>
            )}
            {storeCount > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">{storeCount} {storeCount === 1 ? 'store' : 'stores'}</p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-400 italic">No prices</p>
        )}
      </div>
    </Link>
  );
}
