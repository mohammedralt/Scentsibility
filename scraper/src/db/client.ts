import { Pool, PoolClient } from 'pg';
import { ProductListing } from '../types';
import logger from '../logger';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      // Recycle idle connections quickly so the Supabase transaction pooler
      // doesn't close them out from under us mid-run ("Connection terminated
      // unexpectedly"). keepAlive holds the TCP socket open between queries.
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
    });
    pool.on('error', (err) => logger.error({ err }, 'Unexpected pool error'));
  }
  return pool;
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

// ─── Fragrance helpers ───────────────────────────────────────────────────────

export async function upsertFragrance(name: string, brand: string): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO fragrances (name, brand)
     VALUES ($1, $2)
     ON CONFLICT (name, brand) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [name, brand]
  );
  return rows[0].id;
}

export async function getFragranceById(id: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM fragrances WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

// ─── Retailer helpers ────────────────────────────────────────────────────────

export async function getRetailerId(key: string): Promise<string | null> {
  const { rows } = await getPool().query<{ id: string }>(
    `SELECT id FROM retailers WHERE key = $1 AND is_active = true`,
    [key]
  );
  return rows[0]?.id ?? null;
}

export async function getActiveRetailers() {
  const { rows } = await getPool().query(
    `SELECT * FROM retailers WHERE is_active = true ORDER BY name`
  );
  return rows;
}

// ─── Tracked product helpers ─────────────────────────────────────────────────

export async function upsertTrackedProduct(
  fragranceId: string,
  retailerId: string,
  productUrl: string,
  sizeMl: number | null,
  variantLabel: string | null = null
): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO tracked_products (fragrance_id, retailer_id, product_url, size_ml, variant_label)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (fragrance_id, retailer_id, size_ml)
     DO UPDATE SET product_url = EXCLUDED.product_url,
                   variant_label = EXCLUDED.variant_label
     RETURNING id`,
    [fragranceId, retailerId, productUrl, sizeMl, variantLabel]
  );
  return rows[0].id;
}

export async function getAllTrackedProducts() {
  const { rows } = await getPool().query(
    `SELECT tp.*, r.key AS retailer_key
     FROM tracked_products tp
     JOIN retailers r ON r.id = tp.retailer_id
     WHERE r.is_active = true
     ORDER BY tp.last_scraped_at ASC NULLS FIRST`
  );
  return rows;
}

// ─── Price snapshot helpers ───────────────────────────────────────────────────

export async function recordPriceSnapshot(
  trackedProductId: string,
  price: number,
  currency: string,
  inStock: boolean
): Promise<void> {
  await withClient(async (client) => {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO price_snapshots (tracked_product_id, price, currency, in_stock)
       VALUES ($1, $2, $3, $4)`,
      [trackedProductId, price, currency, inStock]
    );

    // Keep last_price on the tracked_product row current for fast lookups
    await client.query(
      `UPDATE tracked_products
       SET last_price = $1, last_in_stock = $2, last_scraped_at = NOW()
       WHERE id = $3`,
      [price, inStock, trackedProductId]
    );

    await client.query('COMMIT');
  });
}

export async function getPriceHistory(trackedProductId: string, limitDays = 90) {
  const { rows } = await getPool().query(
    `SELECT price, currency, in_stock, scraped_at
     FROM price_snapshots
     WHERE tracked_product_id = $1
       AND scraped_at >= NOW() - INTERVAL '${limitDays} days'
     ORDER BY scraped_at ASC`,
    [trackedProductId]
  );
  return rows;
}

// ─── Watchlist / notifications ───────────────────────────────────────────────

// Full bottles only: a $3 decant shouldn't count as a "new best deal". Same
// rules as web/lib/listings.ts — keep the two in sync:
//   - sample words in the variant label or URL, or under 30ml → sample
//   - no size and under 40% of the median known full-bottle price → sample
const SAMPLE_WORDS_RE = String.raw`\m(samples?|decants?|vials?|atomi[sz]er|travel|mini|miniature|splits?)\M`;

// The lowest currently-listed full-bottle price for a fragrance across all its
// tracked retailers — this is what "new best deal" is measured against.
export async function getFragranceBestPrice(fragranceId: string): Promise<number | null> {
  const { rows } = await getPool().query<{ min: string | null }>(
    `WITH l AS (
       SELECT last_price, size_ml,
              (COALESCE(variant_label, '') || ' ' || regexp_replace(product_url, '[-_/?=&.]', ' ', 'g')) ~* $2 AS sample_words
       FROM tracked_products
       WHERE fragrance_id = $1 AND last_price IS NOT NULL
     ),
     ref AS (
       SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY last_price) AS typical
       FROM l WHERE size_ml >= 30 AND NOT sample_words
     )
     SELECT MIN(l.last_price)::text AS min
     FROM l CROSS JOIN ref
     WHERE NOT l.sample_words
       AND (l.size_ml >= 30
            OR (l.size_ml IS NULL AND (ref.typical IS NULL OR l.last_price >= 0.4 * ref.typical)))`,
    [fragranceId, SAMPLE_WORDS_RE]
  );
  return rows[0]?.min != null ? parseFloat(rows[0].min) : null;
}

// Price history older than this is never shown (charts cover 90 days), so drop
// it to keep the database well inside Supabase's free-tier size limit.
export async function pruneOldSnapshots(keepDays: number): Promise<number> {
  const { rowCount } = await getPool().query(
    `DELETE FROM price_snapshots WHERE scraped_at < NOW() - make_interval(days => $1)`,
    [keepDays]
  );
  return rowCount ?? 0;
}

// The website counts sign-in attempts per IP address (rate_limits). The privacy
// policy promises those are gone within about a day.
export async function pruneRateLimits(): Promise<number> {
  const { rowCount } = await getPool().query(
    `DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 day'`
  ).catch((err) => {
    if (err.code === '42P01') return { rowCount: 0 }; // table not created yet
    throw err;
  });
  return rowCount ?? 0;
}

export async function getWatchersToNotify(fragranceId: string, newBestPrice: number) {
  // Find users watching this fragrance whose threshold the new best price clears
  // (no threshold = any new best deal qualifies), and who haven't already been
  // emailed about this fragrance in the last 24 hours.
  const { rows } = await getPool().query(
    `SELECT wi.id AS watchlist_item_id, wi.user_id, u.email, wi.alert_threshold
     FROM watchlist_items wi
     JOIN users u ON u.id = wi.user_id
     WHERE wi.fragrance_id = $1
       AND wi.notify_email = true
       AND (wi.alert_threshold IS NULL OR $2 <= wi.alert_threshold)
       AND NOT EXISTS (
         SELECT 1 FROM notifications_sent ns
         WHERE ns.watchlist_item_id = wi.id
           AND ns.sent_at >= NOW() - INTERVAL '24 hours'
       )`,
    [fragranceId, newBestPrice]
  );
  return rows;
}

export async function logNotificationSent(
  userId: string,
  watchlistItemId: string,
  trackedProductId: string,
  price: number
): Promise<void> {
  await getPool().query(
    `INSERT INTO notifications_sent (user_id, watchlist_item_id, tracked_product_id, price_at_send)
     VALUES ($1, $2, $3, $4)`,
    [userId, watchlistItemId, trackedProductId, price]
  );
}

// Convenience: save scraped product and return its tracked_product id
export async function saveScrapedProduct(
  product: ProductListing,
  retailerKey: string
): Promise<string | null> {
  const retailerId = await getRetailerId(retailerKey);
  if (!retailerId) {
    logger.warn({ retailerKey }, 'Retailer not found in DB — add it to schema.sql');
    return null;
  }

  const fragranceId = await upsertFragrance(product.name, product.brand);
  const trackedId = await upsertTrackedProduct(
    fragranceId,
    retailerId,
    product.url,
    product.size_ml,
    product.variant_label
  );

  await recordPriceSnapshot(trackedId, product.price, product.currency, product.in_stock);
  return trackedId;
}
