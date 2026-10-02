import Link from 'next/link';
import Image from 'next/image';
import { Search, ArrowRight } from 'lucide-react';
import { getFeaturedFragrances, getPricesForFragrances, getRetailers } from '@/lib/db';
import { FragranceCard } from '@/components/FragranceCard';
import { summarizeListings, type ListingSummary } from '@/lib/listings';
import { formatPrice, isStagedImage } from '@/lib/utils';
import type { Fragrance } from '@/lib/types';

type Featured = { fragrance: Fragrance; summary: ListingSummary };

async function loadHome(): Promise<{ featured: Featured[]; stores: string[] } | null> {
  try {
    const [fragrances, retailers] = await Promise.all([getFeaturedFragrances(15), getRetailers()]);
    const prices = await getPricesForFragrances(fragrances.map((f) => f.id));
    return {
      featured: fragrances.map((f) => ({ fragrance: f, summary: summarizeListings(prices.get(f.id) ?? []) })),
      stores: retailers.map((r) => r.name),
    };
  } catch {
    return null;
  }
}

const STEPS = [
  { title: 'Look it up', body: 'Search any fragrance and see every store that stocks it, cheapest bottle first.' },
  { title: 'Name your price', body: "Track a bottle and, if you like, tell us what you'd happily pay for it." },
  { title: 'Hear about the drop', body: 'When it hits a new low, we email you. No newsletters, nothing else.' },
];

export default async function HomePage() {
  const data = await loadHome();
  // The hero shows a few of the photographed bottles
  const showcase = (data?.featured ?? [])
    .filter((f) => isStagedImage(f.fragrance.image_url) && f.summary.cheapest)
    .slice(0, 3);

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-gray-900">
        <div className="pointer-events-none absolute -top-40 right-0 h-[560px] w-[760px] bg-[radial-gradient(closest-side,rgba(216,172,90,0.13),transparent)]" />

        <div className="relative max-w-6xl mx-auto px-4 pt-16 pb-20 sm:pt-24 sm:pb-28 grid lg:grid-cols-[1.1fr_1fr] gap-14 items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-300 mb-6">
              The fragrance price tracker
            </p>
            <h1 className="font-serif font-normal text-[56px] sm:text-[84px] leading-[0.92] tracking-tight text-gray-50">
              Smell expensive.
              <br />
              <em className="text-brand-300">Pay less.</em>
            </h1>
            <p className="mt-7 text-lg leading-relaxed text-gray-300 max-w-md">
              We check prices at Jomashop, Olfactory Factory, Fragrance Nevaeh, Fragrance Lord and more,
              so you can always find the best deal on the scents you love.
            </p>

            <form action="/search" method="GET" className="mt-9 flex max-w-md items-center rounded-full border border-gray-700 bg-gray-900/80 p-1.5 pl-5 focus-within:border-brand-400 transition-colors">
              <Search className="h-5 w-5 flex-shrink-0 text-gray-500" />
              <input
                type="search"
                name="q"
                placeholder="Try Santal 33 or Aventus"
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[15px] text-gray-50 placeholder:text-gray-500 focus:outline-none"
              />
              <button type="submit" className="btn-primary rounded-full px-5 py-2.5">
                Find it
              </button>
            </form>
          </div>

          {/* A few real bottles, with what they cost right now */}
          {showcase.length === 3 && (
            <div className="relative hidden sm:grid grid-cols-3 gap-4 lg:gap-5">
              {showcase.map(({ fragrance, summary }, i) => (
                <Link
                  key={fragrance.id}
                  href={`/fragrance/${fragrance.id}`}
                  className={`group relative block ${i === 1 ? 'mt-12' : i === 2 ? 'mt-24' : ''}`}
                >
                  <div className="relative aspect-[3/4.4] overflow-hidden rounded-[28px] bg-black ring-1 ring-gray-800">
                    <Image
                      src={fragrance.image_url!}
                      alt={`${fragrance.brand} ${fragrance.name}`}
                      fill
                      sizes="200px"
                      priority
                      className="object-cover scale-[1.35] transition-transform duration-700 group-hover:scale-[1.42]"
                    />
                  </div>
                  <div className="mt-3 px-1">
                    <p className="truncate text-[11px] uppercase tracking-wider text-gray-500">{fragrance.brand}</p>
                    <p className="truncate font-serif text-xl leading-tight text-gray-100">{fragrance.name}</p>
                    <p className="text-sm text-brand-300">
                      from {formatPrice(Number(summary.cheapest!.last_price), summary.cheapest!.currency)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Stores */}
      {data && data.stores.length > 0 && (
        <section className="border-b border-gray-900">
          <div className="max-w-6xl mx-auto px-4 py-6 flex items-baseline gap-x-6 gap-y-2 overflow-x-auto whitespace-nowrap sm:flex-wrap sm:whitespace-normal [scrollbar-width:none]">
            <span className="flex-shrink-0 text-xs uppercase tracking-[0.2em] text-gray-500">Prices from</span>
            {data.stores.map((name) => (
              <span key={name} className="flex-shrink-0 font-serif text-lg text-gray-400">{name}</span>
            ))}
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-4 py-20 grid gap-10 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <div key={step.title} className="border-t border-gray-800 pt-6">
            <p className="font-serif text-5xl text-brand-300/80 leading-none">0{i + 1}</p>
            <h3 className="mt-4 text-lg font-semibold text-gray-50">{step.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-gray-400">{step.body}</p>
          </div>
        ))}
      </section>

      {/* Featured fragrances */}
      <section className="max-w-6xl mx-auto w-full px-4">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="font-serif font-normal text-4xl sm:text-5xl text-gray-50">Most compared</h2>
            <p className="mt-2 text-gray-400">The bottles with the most stores to choose from.</p>
          </div>
          <Link href="/search" className="hidden sm:inline-flex items-center gap-1.5 text-sm text-brand-300 hover:text-brand-200">
            See everything <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {!data ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg mb-2">Could not connect to database.</p>
            <p className="text-sm">Check that your Supabase project is active.</p>
          </div>
        ) : data.featured.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg mb-2">No fragrances tracked yet.</p>
            <p className="text-sm">Run the scraper to populate prices.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {data.featured.map(({ fragrance, summary }) => (
              <FragranceCard key={fragrance.id} fragrance={fragrance} summary={summary} />
            ))}
          </div>
        )}

        <Link href="/search" className="sm:hidden mt-8 inline-flex items-center gap-1.5 text-sm text-brand-300">
          See everything <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  );
}
