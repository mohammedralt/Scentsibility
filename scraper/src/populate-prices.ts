/**
 * Scrapes USD prices for all seeded fragrances across all active retailers
 * and saves them into the database, linked to the existing fragrance records.
 *
 * Usage:
 *   ts-node src/populate-prices.ts
 *   ts-node src/populate-prices.ts --retailer beautyhouse   # single retailer
 *   ts-node src/populate-prices.ts --limit 10               # first 10 fragrances only
 */
import 'dotenv/config';
import { getPool, getRetailerId, upsertTrackedProduct, recordPriceSnapshot } from './db/client';
import { getScraper, getRetailerKeys } from './retailers/registry';
import { ProductListing } from './types';
import { phraseText as normalize } from './utils';
import logger from './logger';

const DELAY_MS = 800; // between requests — be polite

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Non-fragrance products that pollute search results (body care, home, etc.)
const ACCESSORY_PATTERNS = [
  'body wash', 'body lotion', 'body cream', 'body crème', 'shower gel', 'bath gel',
  'hand cream', 'hand cleanser', 'hair perfume', 'hair mist', 'hair oil',
  'shampoo', 'conditioner', 'deodorant', 'soap', 'candle', 'diffuser',
  'lip balm', 'shave', 'aftershave', 'roll-on', 'rollerball reed',
];

// Returns true if the product title plausibly matches the fragrance name
export function isRelevantResult(product: ProductListing, fragranceName: string, brand: string): boolean {
  const title = product.name.toLowerCase();

  // Reject non-fragrance accessories (body wash, candles, hair mist, etc.)
  if (ACCESSORY_PATTERNS.some((p) => title.includes(p))) return false;

  // The fragrance name must appear as a phrase, as whole words in order. Matching
  // its words in any order let "Royal Oud" pick up "Royal Princess Oud" listings.
  const normTitle = normalize(product.name);
  const brandWord = normalize(brand).trim().split(' ')[0];
  return normTitle.includes(normalize(fragranceName)) && normTitle.includes(` ${brandWord} `);
}

async function main() {
  const args = process.argv.slice(2);
  // Read a flag's value only when the flag is actually present, so other flags
  // (e.g. --missing) aren't mistaken for its value.
  const flagValue = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const retailerArg = flagValue('--retailer');
  const limitArg = parseInt(flagValue('--limit') ?? '') || 0;
  // --missing: only fragrances that don't already have a live price. Makes the
  // run resumable — relaunch after a connection drop and it picks up the rest.
  const missingOnly = args.includes('--missing');

  const retailerKeys = retailerArg ? [retailerArg] : getRetailerKeys();

  // Load fragrances to price (all, or only those still lacking a price)
  const { rows: fragrances } = await getPool().query<{ id: string; name: string; brand: string }>(
    missingOnly
      ? `SELECT id, name, brand FROM fragrances f
         WHERE NOT EXISTS (
           SELECT 1 FROM tracked_products tp
           WHERE tp.fragrance_id = f.id AND tp.last_price IS NOT NULL
         )
         ORDER BY brand, name`
      : `SELECT id, name, brand FROM fragrances ORDER BY brand, name`
  );

  const toProcess = limitArg ? fragrances.slice(0, limitArg) : fragrances;
  console.log(`\nProcessing ${toProcess.length} fragrances × ${retailerKeys.length} retailers\n`);

  let totalSaved = 0;
  let totalSkipped = 0;

  for (const fragrance of toProcess) {
    const query = `${fragrance.brand} ${fragrance.name}`;
    console.log(`\n── ${query}`);

    for (const retailerKey of retailerKeys) {
      const retailerId = await getRetailerId(retailerKey);
      if (!retailerId) {
        console.log(`  [${retailerKey}] not in DB — run retailers.sql in Supabase first`);
        continue;
      }

      const scraper = getScraper(retailerKey);

      try {
        const result = await scraper.scrapeSearch(query);
        const relevant = result.products.filter((p) =>
          isRelevantResult(p, fragrance.name, fragrance.brand)
        );

        if (relevant.length === 0) {
          console.log(`  [${retailerKey}] no match`);
        } else {
          for (const product of relevant) {
            const trackedId = await upsertTrackedProduct(
              fragrance.id,
              retailerId,
              product.url,
              product.size_ml,
              product.variant_label
            );
            await recordPriceSnapshot(trackedId, product.price, product.currency, product.in_stock);
            console.log(`  [${retailerKey}] ${product.currency} $${product.price.toFixed(2)} — ${product.name}`);
            totalSaved++;
          }

          // Backfill the fragrance image from a scraped product (only if missing)
          const withImage = relevant.find((p) => p.image_url);
          if (withImage?.image_url) {
            await getPool().query(
              `UPDATE fragrances SET image_url = COALESCE(image_url, $1) WHERE id = $2`,
              [withImage.image_url, fragrance.id]
            );
          }
        }
      } catch (err) {
        console.log(`  [${retailerKey}] ERROR: ${(err as Error).message}`);
      }

      await sleep(DELAY_MS);
    }
  }

  console.log(`\n✓ Done — saved ${totalSaved} price records, skipped ${totalSkipped}\n`);
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, 'populate-prices error');
  process.exit(1);
});
