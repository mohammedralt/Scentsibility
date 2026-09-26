/**
 * Lists tracked listings that probably belong to a different fragrance than
 * the one they're filed under, judged by the product name in the listing's
 * URL. Read-only: it writes a CSV for review and changes nothing.
 *
 *   likely-wrong  the name's words are all there but split up, e.g.
 *                 "Royal Oud" ← /products/creed-royal-princess-oud
 *   variant       the name is followed by a flanker word, e.g.
 *                 "Layton" ← /products/pdm-layton-exclusif
 *   unclear       the name isn't in the URL at all (often abbreviated
 *                 handles like "bdc-edp", so many of these are fine)
 *
 * Usage: ts-node src/report-mismatches.ts [out.csv]
 */
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { getPool } from './db/client';
import { phraseText, FLANKER_WORDS } from './utils';

type Verdict = 'likely-wrong' | 'variant' | 'unclear';

export function urlName(url: string): string {
  const path = url.split(/[?#]/)[0];
  const last = path.match(/\/products\/([^/]+)/)?.[1] ?? path.split('/').filter(Boolean).pop() ?? '';
  return phraseText(last.replace(/\.html$/, ''));
}

// Filler stores put in URLs (gender, "for", "by"); ignored unless part of the name.
// "cologne" isn't here or in FLANKER_WORDS: it's a concentration ("Cologne Absolue").
const FILLER_WORDS = new Set(['unisex', 'mens', 'men', 'womens', 'women', 'ladies', 'lady', 'for', 'by', 'the', 'and']);

export function judge(name: string, slug: string, brand = ''): Verdict | null {
  // Catalog names sometimes repeat the brand ("Acqua Di Parma Blu Mediterraneo")
  const brandText = phraseText(brand);
  let phrase = phraseText(name);
  // ...but keep it when stripping would leave only filler ("Burberry Women" → "women")
  const stripped = phrase.slice(brandText.length - 1);
  if (brand && phrase.startsWith(brandText) && stripped.trim().split(' ').some((w) => w && !FILLER_WORDS.has(w))) {
    phrase = stripped;
  }
  const words = phrase.trim().split(' ');
  const cleanSlug = ` ${slug.trim().split(' ').filter((w) => !FILLER_WORDS.has(w) || words.includes(w)).join(' ')} `;

  const idx = cleanSlug.indexOf(phrase);
  if (idx >= 0) {
    const next = cleanSlug.slice(idx + phrase.length).trim().split(' ')[0];
    return next && FLANKER_WORDS.has(next) && !words.includes(next) ? 'variant' : null;
  }
  // All words present, in order, but not side by side → a different fragrance
  let from = 0;
  const inOrder = words.every((w) => {
    const at = cleanSlug.indexOf(` ${w} `, from);
    if (at < 0) return false;
    from = at + w.length + 1;
    return true;
  });
  return inOrder && words.length > 1 ? 'likely-wrong' : 'unclear';
}

async function main() {
  const out = process.argv[2] ?? 'listing-mismatches.csv';
  const { rows } = await getPool().query(
    `SELECT tp.id, tp.product_url, tp.last_price, f.id AS fragrance_id, f.brand, f.name, r.key AS retailer
     FROM tracked_products tp
     JOIN fragrances f ON f.id = tp.fragrance_id
     JOIN retailers r ON r.id = tp.retailer_id
     ORDER BY f.brand, f.name, r.key`
  );

  const flagged = rows
    .map((r) => ({ ...r, verdict: judge(r.name, urlName(r.product_url), r.brand) }))
    .filter((r): r is typeof r & { verdict: Verdict } => r.verdict !== null);

  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [
    'verdict,retailer,brand,fragrance,price,product_url,fragrance_id,tracked_product_id',
    ...flagged.map((r) => [r.verdict, r.retailer, r.brand, r.name, r.last_price, r.product_url, r.fragrance_id, r.id].map(esc).join(',')),
  ].join('\n');
  writeFileSync(out, csv + '\n');

  const count = (v: Verdict) => flagged.filter((r) => r.verdict === v).length;
  console.log(`${rows.length} listings checked → likely-wrong ${count('likely-wrong')}, variant ${count('variant')}, unclear ${count('unclear')}`);
  for (const v of ['likely-wrong', 'variant'] as const) {
    console.log(`\n── ${v}`);
    for (const r of flagged.filter((x) => x.verdict === v)) {
      console.log(`${r.id} | ${r.brand} ${r.name}  ←  [${r.retailer}] ${r.product_url.split('?')[0]}`);
    }
  }
  console.log(`\nFull list: ${out}`);
  await getPool().end();
}

if (require.main === module) main().catch((err) => { console.error(err); process.exit(1); });
