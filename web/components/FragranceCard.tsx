import Link from 'next/link';
import Image from 'next/image';
import type { Fragrance } from '@/lib/types';
import type { ListingSummary } from '@/lib/listings';
import { formatPrice, cn, isStagedImage } from '@/lib/utils';

interface FragranceCardProps {
  fragrance: Fragrance;
  summary: ListingSummary;
  className?: string;
}

export function FragranceCard({ fragrance, summary, className }: FragranceCardProps) {
  const { cheapest, soldOut, goodDeal } = summary;
  const staged = isStagedImage(fragrance.image_url);

  return (
    <Link
      href={`/fragrance/${fragrance.id}`}
      className={cn(
        'group flex flex-col overflow-hidden rounded-2xl border border-gray-800 bg-gray-900',
        'hover:border-gray-600 transition-colors duration-200',
        className
      )}
    >
      {/* Image */}
      <div className={cn('relative aspect-[4/3.7] overflow-hidden', staged ? 'bg-black' : 'bg-gray-800/60')}>
        {fragrance.image_url ? (
          <Image
            src={fragrance.image_url}
            alt={`${fragrance.brand} ${fragrance.name}`}
            fill
            className={cn(
              'transition-transform duration-500 group-hover:scale-105',
              staged ? 'object-cover' : 'object-contain p-6'
            )}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl select-none">🌸</span>
          </div>
        )}
        {soldOut && (
          <span className="absolute top-3 left-3 rounded-full bg-black/75 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
            Sold out
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
        <p className="truncate text-[11px] font-medium uppercase tracking-wider text-gray-400">
          {fragrance.brand}
        </p>
        <h3 className="mt-0.5 line-clamp-1 text-[15px] font-semibold leading-snug text-gray-50">
          {fragrance.name}
        </h3>

        {cheapest?.last_price != null ? (
          <div className="mt-auto pt-2">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <p className={cn('text-lg font-bold', soldOut ? 'text-gray-500 line-through' : 'text-gray-50')}>
                {formatPrice(Number(cheapest.last_price), cheapest.currency)}
              </p>
              {goodDeal && (
                <span className="whitespace-nowrap rounded-full border border-brand-700 bg-brand-950/60 px-2.5 py-0.5 text-[11px] font-medium text-brand-300">
                  Good Deal
                </span>
              )}
            </div>
            {cheapest.size_ml && <p className="mt-0.5 text-xs text-gray-400">{cheapest.size_ml} ml</p>}
          </div>
        ) : (
          <p className="mt-auto pt-2 text-xs italic text-gray-500">No prices yet</p>
        )}
      </div>
    </Link>
  );
}
