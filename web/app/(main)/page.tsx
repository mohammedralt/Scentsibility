import { Suspense } from 'react';
import Link from 'next/link';
import { Search, TrendingDown, Bell, RefreshCw } from 'lucide-react';
import { getFeaturedFragrances, getPricesForFragrances } from '@/lib/db';
import { FragranceCard } from '@/components/FragranceCard';
import { summarizeListings, type ListingSummary } from '@/lib/listings';

async function FeaturedGrid() {
  let withPrices: { fragrance: Awaited<ReturnType<typeof getFeaturedFragrances>>[0]; summary: ListingSummary }[] = [];

  try {
    const fragrances = await getFeaturedFragrances(15);
    const prices = await getPricesForFragrances(fragrances.map((f) => f.id));
    withPrices = fragrances.map((f) => ({ fragrance: f, summary: summarizeListings(prices.get(f.id) ?? []) }));
  } catch {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-lg mb-2">Could not connect to database.</p>
        <p className="text-sm">Check that your Supabase project is active.</p>
      </div>
    );
  }

  if (withPrices.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-lg mb-2">No fragrances tracked yet.</p>
        <p className="text-sm">Run the scraper to populate prices.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {withPrices.map(({ fragrance, summary }) => (
        <FragranceCard key={fragrance.id} fragrance={fragrance} summary={summary} />
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative bg-gray-950 text-white py-24 px-4 overflow-hidden border-b border-gray-900">
        {/* Soft warm spotlight, echoing the bottle photos */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[900px] h-[520px] bg-[radial-gradient(ellipse_at_center,rgba(120,105,88,0.22),transparent_65%)]" />
          <div className="absolute -bottom-48 left-1/2 -translate-x-1/2 w-[700px] h-72 bg-brand-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-900 text-gray-300 text-xs font-medium mb-6 border border-gray-800">
            <RefreshCw className="h-3 w-3" />
            Prices updated every 12 hours
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Never overpay for<br />
            <span className="text-brand-400">your favourite fragrance</span>
          </h1>

          <p className="text-lg text-gray-300 mb-10 max-w-xl mx-auto">
            We compare prices across Jomashop, Olfactory Factory, Fragrance Nevaeh, Fragrance Lord,
            and more — so you always find the best deal.
          </p>

          {/* Search */}
          <form action="/search" method="GET" className="flex gap-2 max-w-lg mx-auto">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="search"
                name="q"
                placeholder="Search for Sauvage, Bleu de Chanel, Aventus…"
                className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-gray-900 border border-gray-700 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent text-sm"
              />
            </div>
            <button type="submit" className="btn-primary px-6 py-3.5 rounded-xl text-base">
              Search
            </button>
          </form>
        </div>
      </section>

      {/* Feature strip */}
      <section className="border-b border-gray-900 bg-gray-950">
        <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          {[
            {
              icon: <TrendingDown className="h-6 w-6 text-brand-500" />,
              title: 'Live price comparison',
              desc: '11+ retailers tracked in one place',
            },
            {
              icon: <Bell className="h-6 w-6 text-brand-500" />,
              title: 'Price drop alerts',
              desc: 'Email you when a price hits your target',
            },
            {
              icon: <RefreshCw className="h-6 w-6 text-brand-500" />,
              title: 'Updated twice a day',
              desc: 'Scraped every 12 hours automatically',
            },
          ].map((f) => (
            <div key={f.title} className="flex flex-col items-center gap-2">
              {f.icon}
              <p className="font-semibold text-sm">{f.title}</p>
              <p className="text-xs text-gray-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured fragrances */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-xl font-bold">Popular fragrances</h2>
          <Link href="/search?q=" className="text-sm text-brand-400 hover:underline">
            Browse all →
          </Link>
        </div>

        <Suspense
          fallback={
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {Array.from({ length: 15 }).map((_, i) => (
                <div key={i} className="card aspect-square animate-pulse bg-gray-800" />
              ))}
            </div>
          }
        >
          <FeaturedGrid />
        </Suspense>
      </section>
    </div>
  );
}
