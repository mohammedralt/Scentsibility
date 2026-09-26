/**
 * Shows what a retailer's site returns to the scraper, to debug a retailer
 * whose listings all fail to refresh. Read-only.
 *
 * Usage: ts-node src/diagnose-retailer.ts venba
 */
import 'dotenv/config';
import axios from 'axios';
import { getPool } from './db/client';
import { getScraper } from './retailers/registry';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
};

async function probe(label: string, url: string) {
  try {
    const res = await axios.get(url, { headers: HEADERS, timeout: 20_000, maxRedirects: 5, validateStatus: () => true, responseType: 'text' });
    const finalUrl = res.request?.res?.responseUrl ?? url;
    const body = String(res.data).replace(/\s+/g, ' ').slice(0, 300);
    console.log(`\n[${label}] ${url}\n  status ${res.status} · ${res.headers['content-type'] ?? '?'} · server ${res.headers['server'] ?? '?'}`);
    if (finalUrl !== url) console.log(`  redirected to ${finalUrl}`);
    console.log(`  body: ${body}`);
  } catch (err) {
    console.log(`\n[${label}] ${url}\n  request failed: ${(err as Error).message}`);
  }
}

async function main() {
  const key = process.argv[2];
  if (!key) throw new Error('Usage: diagnose-retailer <retailer key>');

  const { rows: [retailer] } = await getPool().query(`SELECT * FROM retailers WHERE key = $1`, [key]);
  console.log('Retailer row:', retailer);
  const { rows: listings } = await getPool().query(
    `SELECT product_url, last_scraped_at FROM tracked_products WHERE retailer_id = $1 ORDER BY random() LIMIT 3`,
    [retailer.id]
  );

  await probe('homepage', retailer.base_url);
  await probe('search', `${retailer.base_url}/search/suggest.json?q=creed&resources[type]=product`);
  for (const l of listings) {
    console.log(`\nListing last refreshed ${l.last_scraped_at}`);
    const handle = l.product_url.match(/\/products\/([^?#/]+)/)?.[1];
    await probe('listing page', l.product_url);
    if (handle) await probe('product.js', `${new URL(l.product_url).origin}/products/${handle}.js`);
    const result = await getScraper(key).scrapeUrl(l.product_url);
    console.log(`  scraper result: success=${result.success} products=${result.products.length} ${result.error ?? ''}`);
  }
  await getPool().end();
}

main().catch((err) => { console.error(err); process.exit(1); });
