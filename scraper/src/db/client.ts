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
  // size_ml is a whole number of ml (a 0.25 oz bottle is 7ml, not 7.5)
  if (sizeMl != null) sizeMl = Math.round(sizeMl);
  // Search results often don't say the size. NULL sizes never clash in the unique
  // key, so reuse the listing for the same product page instead of adding a copy.
  if (sizeMl == null) {
    const { rows: existing } = await getPool().query<{ id: string }>(
      `SELECT id FROM tracked_products
       WHERE fragrance_id = $1 AND retailer_id = $2 AND split_part(product_url, '?', 1) = split_part($3, '?', 1)
       ORDER BY size_ml IS NULL, last_scraped_at DESC NULLS LAST LIMIT 1`,
      [fragranceId, retailerId, productUrl]
    );
    if (existing[0]) return existing[0].id;
  }
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
         -- Only a perfume you can actually buy right now counts as a deal: in stock
         -- on a recent check (the website hides listings older than 48 hours too)
         AND last_in_stock IS TRUE AND product_type IS NULL
         AND last_scraped_at > NOW() - INTERVAL '48 hours'
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

// ─── Sizes ────────────────────────────────────────────────────────────────────

/**
 * Saves the size a product page shows for a listing that was found without one.
 * If the store already has a listing of that size for this fragrance, this one is
 * a duplicate and is removed. Returns what happened.
 */
export async function fillListingSize(
  trackedProductId: string,
  sizeMl: number | null,
  variantLabel: string | null,
  productUrl: string
): Promise<'filled' | 'duplicate' | 'unchanged'> {
  if (sizeMl != null) sizeMl = Math.round(sizeMl);
  if (sizeMl == null) {
    if (variantLabel) {
      await getPool().query(
        `UPDATE tracked_products SET variant_label = $2 WHERE id = $1 AND variant_label IS NULL`,
        [trackedProductId, variantLabel]
      );
    }
    return 'unchanged';
  }
  const { rows } = await getPool().query<{ size_ml: number | null; clash: string | null }>(
    `SELECT tp.size_ml,
            (SELECT o.id FROM tracked_products o
             WHERE o.fragrance_id = tp.fragrance_id AND o.retailer_id = tp.retailer_id
               AND o.size_ml = $2 AND o.id <> tp.id LIMIT 1) AS clash
     FROM tracked_products tp WHERE tp.id = $1`,
    [trackedProductId, sizeMl]
  );
  const row = rows[0];
  if (!row || row.size_ml != null) return 'unchanged';
  if (row.clash) {
    await getPool().query(`DELETE FROM tracked_products WHERE id = $1`, [trackedProductId]);
    return 'duplicate';
  }
  // The product page names the exact variant, so keep its URL to price that size
  await getPool().query(
    `UPDATE tracked_products SET size_ml = $2, variant_label = COALESCE($3, variant_label), product_url = $4 WHERE id = $1`,
    [trackedProductId, sizeMl, variantLabel, productUrl]
  );
  return 'filled';
}

// ─── Product types ────────────────────────────────────────────────────────────
// tracked_products.product_type labels listings that aren't the perfume itself
// ("Body lotion", "Hair mist", ...). NULL means the fragrance. The website shows
// the label and leaves these out of prices and deals.

export async function ensureProductTypeColumn(): Promise<void> {
  await getPool().query(`ALTER TABLE tracked_products ADD COLUMN IF NOT EXISTS product_type TEXT`);
}

export async function setProductType(trackedProductId: string, productType: string | null): Promise<void> {
  await getPool().query(
    `UPDATE tracked_products SET product_type = $1 WHERE id = $2 AND product_type IS DISTINCT FROM $1`,
    [productType, trackedProductId]
  );
}

/** Labels every listing from its URL and size label. Returns how many changed. */
export async function backfillProductTypes(
  classify: (text: string, fragranceName: string) => string | null
): Promise<number> {
  const { rows } = await getPool().query<{ id: string; text: string; name: string; product_type: string | null }>(
    `SELECT tp.id, tp.product_url || ' ' || COALESCE(tp.variant_label, '') AS text, f.name, tp.product_type
     FROM tracked_products tp JOIN fragrances f ON f.id = tp.fragrance_id`
  );
  const changed = rows
    .map((r) => ({ id: r.id, type: classify(r.text, r.name), was: r.product_type }))
    // Only add labels here: a label found from a scraped title is never cleared by the URL alone
    .filter((r) => r.type !== null && r.type !== r.was);
  if (changed.length > 0) {
    await getPool().query(
      `UPDATE tracked_products tp SET product_type = v.type
       FROM unnest($1::uuid[], $2::text[]) AS v(id, type) WHERE tp.id = v.id`,
      [changed.map((r) => r.id), changed.map((r) => r.type)]
    );
  }
  return changed.length;
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
