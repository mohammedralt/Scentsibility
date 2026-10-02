import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Search } from 'lucide-react';
import { searchFragrances, getPricesForFragrances, countFragrances, getRetailers } from '@/lib/db';
import { FragranceListItem } from '@/components/FragranceListItem';
import { SearchFilters } from '@/components/SearchFilters';
import type { TrackedProduct } from '@/lib/types';
import { summarizeListings, bottlesOnly } from '@/lib/listings';

interface SearchPageProps {
  searchParams: {
    q?: string;
    inStock?: string;
    sort?: string;
    gender?: string;
    store?: string;
    size?: string;
    season?: string;
    tester?: string;
  };
}

export function generateMetadata({ searchParams }: SearchPageProps): Metadata {
  const q = searchParams.q ?? '';
  return { title: q ? `"${q}" — Fragrance prices` : 'Browse fragrances' };
}

/** Does a listing's size fall into the chosen bucket? */
function sizeMatches(p: TrackedProduct, bucket: string): boolean {
  const ml = p.size_ml;
  const label = (p.variant_label ?? '').toLowerCase();
  if (bucket === 'sample') {
    return (ml != null && ml < 20) || /sample|decant|travel|miniature/.test(label);
  }
  if (ml == null) return false;
  if (bucket === '30') return ml >= 20 && ml < 40;
  if (bucket === '50') return ml >= 40 && ml < 75;
  if (bucket === '100') return ml >= 75 && ml < 125;
  if (bucket === 'large') return ml >= 125;
  return true;
}

interface Filters {
  query: string;
  inStock: boolean;
  sort: string;
  gender: string;
  store: string;
  size: string;
  season: string;
  tester: string;
}

/** True if `season` is among the fragrance's dominant seasons (within 80% of its top score). */
function seasonMatches(f: { season_spring: number | null; season_summer: number | null; season_fall: number | null; season_winter: number | null }, season: string): boolean {
  const scores: Record<string, number | null> = {
    spring: f.season_spring, summer: f.season_summer, fall: f.season_fall, winter: f.season_winter,
  };
  const vals = Object.values(scores).filter((v): v is number => v != null);
  if (vals.length === 0) return false; // no season data → excluded when filtering by season
  const max = Math.max(...vals);
  const target = scores[season];
  return target != null && max > 0 && target >= max * 0.8;
}

async function Results({ filters }: { filters: Filters }) {
  let total = 0;
  try {
    total = await countFragrances();
  } catch { /* ignore */ }

  let fragrances;
  try {
    fragrances = await searchFragrances(filters.query, 300, { gender: filters.gender, listedOnly: true });
  } catch {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-xl mb-2">Could not connect to database.</p>
        <p className="text-sm">Check that your Supabase project is active.</p>
      </div>
    );
  }

  if (filters.season) {
    fragrances = fragrances.filter((f) => seasonMatches(f, filters.season));
  }

  const prices = await getPricesForFragrances(fragrances.map((f) => f.id));
  const withData = fragrances.map((f) => {
    const allPrices = prices.get(f.id) ?? [];
    // Listings matching the active store / size / stock filters
    let relevant = allPrices;
    if (filters.store) relevant = relevant.filter((p) => p.retailer_key === filters.store);
    if (filters.size) relevant = relevant.filter((p) => sizeMatches(p, filters.size));
    if (filters.inStock) relevant = relevant.filter((p) => p.last_in_stock);
    if (filters.tester === 'hide') relevant = relevant.filter((p) => !p.is_tester);
    else if (filters.tester === 'only') relevant = relevant.filter((p) => p.is_tester);
    return { fragrance: f, allPrices, relevant };
  });

  // Keep only fragrances that still have a matching listing
  let rows = withData
    .filter((r) => r.relevant.length > 0)
    .map((r) => {
      // Cheapest in-stock bottle; samples only count if that's all there is
      const { cheapest, soldOut } = summarizeListings(r.relevant);
      const storeCount = new Set(r.relevant.map((p) => p.retailer_key)).size;
      return { ...r, cheapest, soldOut, storeCount };
    });

  // Sorting
  const priceOf = (p: TrackedProduct | null) => (p?.last_price != null ? Number(p.last_price) : Infinity);
  const avgOf = (list: TrackedProduct[]) =>
    list.length ? list.reduce((s, p) => s + Number(p.last_price ?? 0), 0) / list.length : Infinity;

  if (filters.sort === 'price_asc') {
    rows.sort((a, b) => priceOf(a.cheapest) - priceOf(b.cheapest));
  } else if (filters.sort === 'price_desc') {
    rows.sort((a, b) => priceOf(b.cheapest) - priceOf(a.cheapest));
  } else if (filters.sort === 'name_asc') {rows.sort((a, b) => `${a.fragrance.brand} ${a.fragrance.name}`.localeCompare(`${b.fragrance.brand} ${b.fragrance.name}`)
    );
  } else if (filters.sort === 'best_deal') {
    // Lowest cheapest-vs-average ratio = best relative deal
    rows.sort((a, b) => priceOf(a.cheapest) / avgOf(bottlesOnly(a.allPrices)) - priceOf(b.cheapest) / avgOf(bottlesOnly(b.allPrices)));
  } else {
    // popular: most listings first
    rows.sort((a, b) => b.allPrices.length - a.allPrices.length);
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-xl mb-2">No fragrances match those filters.</p>
        <p className="text-sm">Try removing a filter or searching a different term.</p>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-gray-500 mb-4">
        Showing {rows.length} {rows.length === 1 ? 'fragrance' : 'fragrances'}
        {!filters.query && total > 0 && ` of ${total}`}
      </p>
      <div className="flex flex-col gap-3">
        {rows.map(({ fragrance, cheapest, soldOut, storeCount, relevant }) => (
          <FragranceListItem
            key={fragrance.id}
            fragrance={fragrance}
            cheapest={cheapest}
            soldOut={soldOut}
            storeCount={storeCount}
            allPrices={bottlesOnly(relevant)}
          />
        ))}
      </div>
    </>
  );
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const filters: Filters = {
    query: searchParams.q ?? '',
    inStock: searchParams.inStock === 'true',
    sort: searchParams.sort ?? 'popular',
    gender: searchParams.gender ?? '',
    store: searchParams.store ?? '',
    size: searchParams.size ?? '',
    season: searchParams.season ?? '',
    tester: searchParams.tester ?? '',
  };

  let stores: { key: string; name: string }[] = [];
  try {
    stores = await getRetailers();
  } catch { /* ignore */ }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Search Fragrances</h1>
        <p className="text-gray-500 text-sm mb-6">
          Browse our catalog of niche and designer fragrances from top houses. Search, sort and filter to find the best price.
        </p>

        {/* Search bar */}
        <form action="/search" method="GET" className="flex gap-2 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              name="q"
              defaultValue={filters.query}
              placeholder="Search by brand or fragrance name…"
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-700 bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <button type="submit" className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors">
            Search
          </button>
        </form>

        <SearchFilters stores={stores} />
      </div>

      <Suspense
        key={JSON.stringify(filters)}
        fallback={
          <div className="flex flex-col gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-gray-800 animate-pulse" />
            ))}
          </div>
        }
      >
        <Results filters={filters} />
      </Suspense>
    </div>
  );
}
