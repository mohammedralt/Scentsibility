'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Check } from 'lucide-react';

interface SearchFiltersProps {
  stores: { key: string; name: string }[];
}

const SORTS = [
  { value: 'popular', label: 'Most Popular' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'best_deal', label: 'Best Deal' },
  { value: 'name_asc', label: 'Alphabetical (A–Z)' },
];

const GENDERS = [
  { value: '', label: 'All Genders' },
  { value: 'male', label: 'Men' },
  { value: 'female', label: 'Women' },
  { value: 'unisex', label: 'Unisex' },
];

const SIZES = [
  { value: '', label: 'All Sizes' },
  { value: 'sample', label: 'Sample / Decant' },
  { value: '30', label: '30 ml (1 oz)' },
  { value: '50', label: '50 ml (1.7 oz)' },
  { value: '100', label: '100 ml (3.4 oz)' },
  { value: 'large', label: '125 ml+' },
];

const SEASONS = [
  { value: '', label: 'All Seasons' },
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'fall', label: 'Fall' },
  { value: 'winter', label: 'Winter' },
];

const TESTER = [
  { value: '', label: 'Testers: Include' },
  { value: 'hide', label: 'Hide Testers' },
  { value: 'only', label: 'Testers Only' },
];

/** A styled <select> that looks like a rounded chip and navigates on change. */
function FilterSelect({
  value,
  options,
  onChange,
  active,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  active: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none cursor-pointer pl-3.5 pr-8 py-1.5 rounded-full text-sm border transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 ${
          active
            ? 'bg-brand-300 text-gray-950 border-brand-300'
            : 'bg-gray-900 text-gray-200 border-gray-700 hover:border-brand-500'
        }`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="text-gray-50">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className={`absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none ${
          active ? 'text-white' : 'text-gray-400'
        }`}
      />
    </div>
  );
}

export function SearchFilters({ stores }: SearchFiltersProps) {
  const router = useRouter();
  const params = useSearchParams();

  const sort = params.get('sort') ?? 'popular';
  const gender = params.get('gender') ?? '';
  const store = params.get('store') ?? '';
  const size = params.get('size') ?? '';
  const season = params.get('season') ?? '';
  const tester = params.get('tester') ?? '';
  const inStock = params.get('inStock') === 'true';

  function setParam(key: string, value: string) {
    const p = new URLSearchParams(params.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    router.push(`/search?${p.toString()}`);
  }

  const storeOptions = [
    { value: '', label: 'All Stores' },
    ...stores.map((s) => ({ value: s.key, label: s.name })),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      <FilterSelect value={sort} options={SORTS} onChange={(v) => setParam('sort', v === 'popular' ? '' : v)} active={sort !== 'popular'} />
      <FilterSelect value={gender} options={GENDERS} onChange={(v) => setParam('gender', v)} active={!!gender} />
      <FilterSelect value={store} options={storeOptions} onChange={(v) => setParam('store', v)} active={!!store} />
      <FilterSelect value={size} options={SIZES} onChange={(v) => setParam('size', v)} active={!!size} />
      <FilterSelect value={season} options={SEASONS} onChange={(v) => setParam('season', v)} active={!!season} />
      <FilterSelect value={tester} options={TESTER} onChange={(v) => setParam('tester', v)} active={!!tester} />

      <button
        onClick={() => setParam('inStock', inStock ? '' : 'true')}
        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm border transition-colors ${
          inStock
            ? 'bg-brand-300 text-gray-950 border-brand-300'
            : 'bg-gray-900 text-gray-200 border-gray-700 hover:border-brand-500'
        }`}
      >
        {inStock && <Check className="h-3.5 w-3.5" />}
        In Stock
      </button>
    </div>
  );
}
