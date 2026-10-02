import type { MetadataRoute } from 'next';
import { getPool } from '@/lib/db';
import { SITE_URL } from '@/lib/site';

// Rebuilt at most once a day
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/search`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.1 },
  ];

  try {
    // Only fragrances with prices; the rest have nothing to show yet
    const { rows } = await getPool().query<{ id: string; updated: Date | null }>(
      `SELECT f.id, MAX(tp.last_scraped_at) AS updated
       FROM fragrances f JOIN tracked_products tp ON tp.fragrance_id = f.id
       WHERE tp.last_price IS NOT NULL
       GROUP BY f.id`
    );
    for (const row of rows) {
      pages.push({
        url: `${SITE_URL}/fragrance/${row.id}`,
        lastModified: row.updated ?? undefined,
        changeFrequency: 'daily',
        priority: 0.6,
      });
    }
  } catch (err) {
    console.error('sitemap: could not load fragrances', err);
  }
  return pages;
}
