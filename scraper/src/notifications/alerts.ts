/**
 * Records a freshly scraped price and emails watchers when it sets a new best
 * deal for the fragrance. Shared by the BullMQ worker and refresh-prices.
 */
import { getPool, recordPriceSnapshot, getWatchersToNotify, logNotificationSent, getFragranceBestPrice } from '../db/client';
import { ProductListing } from '../types';
import { sendPriceAlert, emailConfigured } from './email';
import logger from '../logger';

// Retailers are scraped concurrently, so two listings of the same fragrance can
// be recorded at once. Without serializing, each would see the other's new low
// between its before/after reads and email the same watchers again.
const fragranceLocks = new Map<string, Promise<unknown>>();

function withFragranceLock<T>(fragranceId: string, fn: () => Promise<T>): Promise<T> {
  const previous = fragranceLocks.get(fragranceId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(fn);
  const tail = run.catch(() => undefined);
  fragranceLocks.set(fragranceId, tail);
  tail.then(() => {
    if (fragranceLocks.get(fragranceId) === tail) fragranceLocks.delete(fragranceId);
  });
  return run;
}

export function recordPriceAndAlert(
  trackedProductId: string,
  fragranceId: string,
  retailerKey: string,
  product: ProductListing
): Promise<{ alertsSent: number }> {
  return withFragranceLock(fragranceId, () => recordAndAlert(trackedProductId, fragranceId, retailerKey, product));
}

async function recordAndAlert(
  trackedProductId: string,
  fragranceId: string,
  retailerKey: string,
  product: ProductListing
): Promise<{ alertsSent: number }> {
  // Capture the fragrance's cheapest price across all retailers before this
  // scrape overwrites it, so we can tell whether this scrape set a new low.
  const previousBest = await getFragranceBestPrice(fragranceId);
  await recordPriceSnapshot(trackedProductId, product.price, product.currency, product.in_stock);

  const newBest = await getFragranceBestPrice(fragranceId);
  // Only alert on an actual new low — not on every re-scrape, and not on the
  // very first price ever recorded for a fragrance (nothing to compare it to).
  if (previousBest === null || newBest === null || newBest >= previousBest) return { alertsSent: 0 };

  // A new low can only come from this listing, since it's the only one that changed
  const watchers = await getWatchersToNotify(fragranceId, newBest);
  if (watchers.length === 0) return { alertsSent: 0 };

  if (!emailConfigured()) {
    logger.warn({ fragranceId, watchers: watchers.length }, 'New best deal but no email provider is configured — skipping alerts');
    return { alertsSent: 0 };
  }

  const { rows } = await getPool().query<{ name: string; brand: string; retailer_name: string }>(
    `SELECT f.name, f.brand, r.name AS retailer_name
     FROM fragrances f, retailers r
     WHERE f.id = $1 AND r.key = $2`,
    [fragranceId, retailerKey]
  );
  const info = rows[0];

  let alertsSent = 0;
  for (const watcher of watchers) {
    try {
      await sendPriceAlert({
        toEmail: watcher.email,
        fragranceName: info?.name ?? product.name,
        brand: info?.brand ?? product.brand,
        retailerName: info?.retailer_name ?? retailerKey,
        price: newBest,
        currency: product.currency,
        productUrl: product.url,
        fragrancePageUrl: process.env.APP_URL ? `${process.env.APP_URL}/fragrance/${fragranceId}` : null,
        threshold: watcher.alert_threshold != null ? Number(watcher.alert_threshold) : null,
        previousBest,
      });
      await logNotificationSent(watcher.user_id, watcher.watchlist_item_id, trackedProductId, newBest);
      alertsSent++;
    } catch (err) {
      logger.error({ err, userId: watcher.user_id }, 'Failed to send price alert email');
    }
  }
  return { alertsSent };
}
