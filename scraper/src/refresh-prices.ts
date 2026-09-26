/**
 * Re-scrapes every tracked listing once, records a fresh price snapshot, and
 * emails watchers when a price sets a new best deal. Unlike the scheduler +
 * worker pair it needs no Redis and exits when done, so it can run from a
 * cron job (see .github/workflows/refresh-prices.yml).
 *
 * Retailers are scraped in parallel; listings within one retailer go one at a
 * time with a polite delay. Stalest listings go first, so a run cut short by
 * --max-minutes still moves the oldest data forward.
 *
 * Usage:
 *   ts-node src/refresh-prices.ts
 *   ts-node src/refresh-prices.ts --retailer beautyhouse   # single retailer
 *   ts-node src/refresh-prices.ts --skip jomashop          # skip a retailer (comma-separated)
 *   ts-node src/refresh-prices.ts --max-minutes 60         # stop starting new scrapes after an hour
 *   ts-node src/refresh-prices.ts --keep-days 90           # delete price history older than this (default 90)
 */
import 'dotenv/config';
import { getPool, pruneOldSnapshots } from './db/client';
import { getScraper, getRetailerKeys } from './retailers/registry';
import { recordPriceAndAlert } from './notifications/alerts';
import logger from './logger';

const DELAY_MS = 800; // between requests to the same retailer — be polite

interface Listing {
  id: string;
  fragrance_id: string;
  product_url: string;
  retailer_key: string;
}

interface RetailerStats {
  updated: number;
  failed: number;
  alerts: number;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function refreshRetailer(retailerKey: string, listings: Listing[], deadline: number): Promise<RetailerStats> {
  const stats: RetailerStats = { updated: 0, failed: 0, alerts: 0 };
  const scraper = getScraper(retailerKey);

  // Browser-based scrapers (Jomashop, and Shopify stores behind Cloudflare) get
  // one browser for the whole run instead of launching Chrome per listing.
  const needsBrowser = scraper.usesBrowser;
  if (needsBrowser) await scraper.launch();

  try {
    for (const listing of listings) {
      if (Date.now() > deadline) {
        logger.warn({ retailerKey, remaining: listings.length - stats.updated - stats.failed }, 'Time budget used up — stopping');
        break;
      }

      try {
        const product = needsBrowser
          ? await scraper.scrapeProductPage(listing.product_url)
          : (await scraper.scrapeUrl(listing.product_url)).products[0] ?? null;

        if (!product) {
          stats.failed++;
        } else {
          const { alertsSent } = await recordPriceAndAlert(listing.id, listing.fragrance_id, retailerKey, product);
          stats.updated++;
          stats.alerts += alertsSent;
        }
      } catch (err) {
        stats.failed++;
        logger.error({ retailerKey, url: listing.product_url, err }, 'Refresh failed for listing');
      }

      const done = stats.updated + stats.failed;
      if (done % 50 === 0) logger.info({ retailerKey, done, total: listings.length }, 'Progress');

      await sleep(DELAY_MS);
    }
  } finally {
    if (needsBrowser) await scraper.close();
  }

  return stats;
}

async function main() {
  const args = process.argv.slice(2);
  const flagValue = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const onlyRetailer = flagValue('--retailer');
  const skip = new Set((flagValue('--skip') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const maxMinutes = parseFloat(flagValue('--max-minutes') ?? '') || Infinity;
  const deadline = Date.now() + maxMinutes * 60_000;
  const keepDays = parseInt(flagValue('--keep-days') ?? '') || 90;

  const known = new Set(getRetailerKeys());
  const { rows } = await getPool().query<Listing>(
    `SELECT tp.id, tp.fragrance_id, tp.product_url, r.key AS retailer_key
     FROM tracked_products tp
     JOIN retailers r ON r.id = tp.retailer_id
     WHERE r.is_active = true
     ORDER BY tp.last_scraped_at ASC NULLS FIRST`
  );

  const byRetailer = new Map<string, Listing[]>();
  for (const row of rows) {
    if (!known.has(row.retailer_key) || skip.has(row.retailer_key)) continue;
    if (onlyRetailer && row.retailer_key !== onlyRetailer) continue;
    if (!byRetailer.has(row.retailer_key)) byRetailer.set(row.retailer_key, []);
    byRetailer.get(row.retailer_key)!.push(row);
  }

  const total = [...byRetailer.values()].reduce((n, l) => n + l.length, 0);
  logger.info({ total, retailers: [...byRetailer.keys()] }, 'Refreshing tracked listings');

  const results = await Promise.all(
    [...byRetailer.entries()].map(async ([key, listings]) => {
      try {
        return [key, await refreshRetailer(key, listings, deadline)] as const;
      } catch (err) {
        logger.error({ retailerKey: key, err }, 'Retailer refresh crashed');
        return [key, { updated: 0, failed: listings.length, alerts: 0 }] as const;
      }
    })
  );

  console.log('\nRetailer            updated  failed  alerts');
  let updated = 0;
  let alerts = 0;
  for (const [key, s] of results) {
    console.log(`${key.padEnd(20)}${String(s.updated).padStart(7)}${String(s.failed).padStart(8)}${String(s.alerts).padStart(8)}`);
    updated += s.updated;
    alerts += s.alerts;
  }
  console.log(`\n✓ Refreshed ${updated}/${total} listings, sent ${alerts} alerts`);

  try {
    const pruned = await pruneOldSnapshots(keepDays);
    console.log(`✓ Deleted ${pruned} price snapshots older than ${keepDays} days\n`);
  } catch (err) {
    logger.error({ err }, 'Pruning old snapshots failed');
  }

  await getPool().end();
  // A run that updated nothing means something is broken (DB, network, every
  // retailer blocking us) — fail loudly so the scheduled job shows red.
  process.exit(total > 0 && updated === 0 ? 1 : 0);
}

main().catch((err) => {
  logger.error({ err }, 'refresh-prices error');
  process.exit(1);
});
