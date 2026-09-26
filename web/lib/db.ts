import { Pool } from 'pg';
import type { Fragrance, TrackedProduct, PriceSnapshot, WatchlistItem } from './types';
import { cheapestBottle } from './listings';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

// ─── Fragrances ──────────────────────────────────────────────────────────────

export async function searchFragrances(query: string, limit = 20): Promise<Fragrance[]> {
  if (!query.trim()) {
    const { rows } = await getPool().query<Fragrance>(
      `SELECT * FROM fragrances ORDER BY brand, name LIMIT $1`,
      [limit]
    );
    return rows;
  }
  const { rows } = await getPool().query<Fragrance>(
    `SELECT * FROM fragrances
     WHERE to_tsvector('english', name || ' ' || brand) @@ plainto_tsquery('english', $1)
        OR name ILIKE $2
        OR brand ILIKE $2
     ORDER BY brand, name
     LIMIT $3`,
    [query, `%${query}%`, limit]
  );
  return rows;
}

export async function countFragrances(): Promise<number> {
  const { rows } = await getPool().query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM fragrances`);
  return parseInt(rows[0].count, 10);
}

export async function getRetailers(): Promise<{ key: string; name: string }[]> {
  const { rows } = await getPool().query<{ key: string; name: string }>(
    `SELECT key, name FROM retailers WHERE is_active = true ORDER BY name`
  );
  return rows;
}

export async function getFragranceById(id: string): Promise<Fragrance | null> {
  const { rows } = await getPool().query<Fragrance>(
    `SELECT * FROM fragrances WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function getFeaturedFragrances(limit = 12): Promise<Fragrance[]> {
  const { rows } = await getPool().query<Fragrance>(
    `SELECT f.*,
       COUNT(tp.id) AS listing_count
     FROM fragrances f
     LEFT JOIN tracked_products tp ON tp.fragrance_id = f.id AND tp.last_price IS NOT NULL
     GROUP BY f.id
     ORDER BY listing_count DESC, f.brand, f.name
     LIMIT $1`,
    [limit]
  );
  return rows;
}

// ─── Prices ───────────────────────────────────────────────────────────────────

export async function getFragrancePrices(fragranceId: string): Promise<TrackedProduct[]> {
  const { rows } = await getPool().query<TrackedProduct>(
    `SELECT
       tp.id, tp.fragrance_id, tp.retailer_id,
       r.key AS retailer_key, r.name AS retailer_name,
       tp.product_url, tp.size_ml, tp.variant_label,
       (tp.product_url ILIKE '%tester%' OR tp.variant_label ILIKE '%tester%') AS is_tester,
       tp.last_price, tp.last_in_stock, tp.last_scraped_at,
       r.currency
     FROM tracked_products tp
     JOIN retailers r ON r.id = tp.retailer_id
     WHERE tp.fragrance_id = $1
       AND tp.last_price IS NOT NULL
       AND r.is_active = true
     ORDER BY tp.last_price ASC`,
    [fragranceId]
  );
  return rows;
}

export async function getPriceHistory(
  trackedProductId: string,
  days = 90
): Promise<PriceSnapshot[]> {
  const { rows } = await getPool().query<PriceSnapshot>(
    `SELECT price, currency, in_stock, scraped_at
     FROM price_snapshots
     WHERE tracked_product_id = $1
       AND scraped_at >= NOW() - ($2 || ' days')::INTERVAL
     ORDER BY scraped_at ASC`,
    [trackedProductId, days]
  );
  return rows;
}

export async function getAllPriceHistoryForFragrance(
  fragranceId: string,
  days = 90
): Promise<Array<PriceSnapshot & { retailer_name: string; retailer_key: string }>> {
  const { rows } = await getPool().query(
    `SELECT
       ps.price, ps.currency, ps.in_stock, ps.scraped_at,
       r.name AS retailer_name, r.key AS retailer_key
     FROM price_snapshots ps
     JOIN tracked_products tp ON tp.id = ps.tracked_product_id
     JOIN retailers r ON r.id = tp.retailer_id
     WHERE tp.fragrance_id = $1
       AND ps.scraped_at >= NOW() - ($2 || ' days')::INTERVAL
     ORDER BY ps.scraped_at ASC`,
    [fragranceId, days]
  );
  return rows;
}

// ─── Watchlist ────────────────────────────────────────────────────────────────

export async function getUserWatchlist(userId: string): Promise<WatchlistItem[]> {
  const { rows } = await getPool().query(
    `SELECT
       wi.id, wi.fragrance_id,
       f.name AS fragrance_name, f.brand AS fragrance_brand,
       f.image_url AS fragrance_image,
       wi.alert_threshold, wi.created_at
     FROM watchlist_items wi
     JOIN fragrances f ON f.id = wi.fragrance_id
     WHERE wi.user_id = $1
     ORDER BY wi.created_at DESC`,
    [userId]
  );

  // Headline price is the cheapest full bottle, same as the fragrance page
  return Promise.all(
    rows.map(async (row) => {
      const cheapest = cheapestBottle(await getFragrancePrices(row.fragrance_id));
      return {
        ...row,
        alert_threshold: row.alert_threshold != null ? Number(row.alert_threshold) : null,
        cheapest_price: cheapest?.last_price != null ? Number(cheapest.last_price) : null,
        cheapest_retailer: cheapest?.retailer_name ?? null,
        cheapest_currency: cheapest?.currency ?? null,
      };
    })
  );
}

export async function addToWatchlist(
  userId: string,
  fragranceId: string,
  threshold: number | null
): Promise<WatchlistItem> {
  const { rows } = await getPool().query(
    `INSERT INTO watchlist_items (user_id, fragrance_id, alert_threshold)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, fragrance_id)
     DO UPDATE SET alert_threshold = EXCLUDED.alert_threshold
     RETURNING *`,
    [userId, fragranceId, threshold]
  );
  return rows[0];
}

export async function removeFromWatchlist(userId: string, itemId: string): Promise<void> {
  await getPool().query(
    `DELETE FROM watchlist_items WHERE id = $1 AND user_id = $2`,
    [itemId, userId]
  );
}

export async function getWatchlistItem(
  userId: string,
  fragranceId: string
): Promise<{ id: string; alert_threshold: number | null } | null> {
  const { rows } = await getPool().query<{ id: string; alert_threshold: string | null }>(
    `SELECT id, alert_threshold FROM watchlist_items WHERE user_id = $1 AND fragrance_id = $2`,
    [userId, fragranceId]
  );
  if (!rows[0]) return null;
  // NUMERIC comes back from pg as a string
  const threshold = rows[0].alert_threshold;
  return { id: rows[0].id, alert_threshold: threshold != null ? Number(threshold) : null };
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getUserByEmail(email: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM users WHERE LOWER(email) = LOWER($1)`,
    [email]
  );
  return rows[0] ?? null;
}

export async function createUser(email: string, passwordHash: string, displayName: string) {
  const { rows } = await getPool().query(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name`,
    [email, passwordHash, displayName]
  );
  return rows[0];
}
