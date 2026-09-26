import type { TrackedProduct } from './types';

// Keep in sync with FULL_BOTTLE_SQL in scraper/src/db/client.ts, which applies
// the same rules when deciding whether a price is a new best deal.
const SAMPLE_WORDS = /\b(sample|samples|decant|decants|vial|vials|atomi[sz]er|travel|mini|miniature|split|splits)\b/i;
const MIN_FULL_ML = 30;
// A listing with no size that costs less than this share of the typical
// full-bottle price is almost certainly a sample or decant.
const UNKNOWN_SIZE_MIN_RATIO = 0.4;

export type ListingKind = 'full' | 'unknown' | 'sample';

function hasSampleWords(p: TrackedProduct): boolean {
  const url = p.product_url.replace(/[-_/?=&.]/g, ' ');
  return SAMPLE_WORDS.test(`${p.variant_label ?? ''} ${url}`);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Classify each listing of one fragrance as a full bottle, unknown size, or sample. */
export function classifyListings(listings: TrackedProduct[]): Map<string, ListingKind> {
  const kinds = new Map<string, ListingKind>();
  const knownFull: number[] = [];

  for (const p of listings) {
    if (hasSampleWords(p) || (p.size_ml != null && p.size_ml < MIN_FULL_ML)) {
      kinds.set(p.id, 'sample');
    } else if (p.size_ml != null) {
      kinds.set(p.id, 'full');
      if (p.last_price != null) knownFull.push(Number(p.last_price));
    }
  }

  const typical = median(knownFull);
  for (const p of listings) {
    if (kinds.has(p.id)) continue;
    const price = Number(p.last_price ?? 0);
    const tooCheap = typical != null && price < typical * UNKNOWN_SIZE_MIN_RATIO;
    kinds.set(p.id, tooCheap ? 'sample' : 'unknown');
  }
  return kinds;
}

/**
 * Full bottles first, then unknown sizes, then samples — each group cheapest
 * first. The first listing is the one to headline as the fragrance's price,
 * unless every listing is a sample.
 */
export function rankListings(listings: TrackedProduct[]): { listing: TrackedProduct; kind: ListingKind }[] {
  const kinds = classifyListings(listings);
  const order: Record<ListingKind, number> = { full: 0, unknown: 1, sample: 2 };
  return listings
    .map((listing) => ({ listing, kind: kinds.get(listing.id)! }))
    .sort((a, b) => order[a.kind] - order[b.kind] || Number(a.listing.last_price) - Number(b.listing.last_price));
}

/** The cheapest listing that isn't a sample, falling back to the cheapest overall. */
export function cheapestBottle(listings: TrackedProduct[]): TrackedProduct | null {
  return rankListings(listings)[0]?.listing ?? null;
}

/** Listings excluding samples (or all of them, if every listing is a sample). */
export function bottlesOnly(listings: TrackedProduct[]): TrackedProduct[] {
  const kinds = classifyListings(listings);
  const bottles = listings.filter((p) => kinds.get(p.id) !== 'sample');
  return bottles.length > 0 ? bottles : listings;
}
