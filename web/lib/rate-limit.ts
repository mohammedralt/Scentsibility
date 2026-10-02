import { getPool } from './db';

/**
 * Fixed-window rate limiting kept in Postgres, so it holds across Vercel's
 * serverless instances. Returns false once `key` has been used `limit` times
 * within the window.
 */
let tableReady: Promise<unknown> | null = null;

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  tableReady ??= getPool().query(
    `CREATE TABLE IF NOT EXISTS rate_limits (
       key          TEXT PRIMARY KEY,
       count        INTEGER NOT NULL,
       window_start TIMESTAMPTZ NOT NULL
     );
     -- Holds IP addresses: keep it out of Supabase's public Data API.
     -- The site's own database user owns the table, so it isn't affected.
     ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;`
  ).catch((err) => { tableReady = null; throw err; });
  await tableReady;

  const { rows } = await getPool().query<{ count: number }>(
    `INSERT INTO rate_limits (key, count, window_start) VALUES ($1, 1, NOW())
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start < NOW() - make_interval(secs => $2) THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start < NOW() - make_interval(secs => $2) THEN NOW() ELSE rate_limits.window_start END
     RETURNING count`,
    [key, windowSeconds]
  );
  // Clear out expired windows now and then so the table stays small
  if (Math.random() < 0.01) {
    getPool().query(`DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 day'`).catch(() => {});
  }
  return rows[0].count <= limit;
}

/** The caller's IP address, as Vercel reports it. */
export function clientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0].trim() || headers.get('x-real-ip') || 'unknown';
}
