/**
 * Generic Shopify scraper — works for any Shopify store via their predictive search API.
 * Uses direct HTTP (no browser needed), except for stores behind a Cloudflare
 * challenge (use_browser), where the same JSON endpoints are fetched from inside
 * a stealth browser page that has passed the challenge.
 */
import axios from 'axios';
import { Page } from 'playwright';
import { BaseScraper } from './base';
import { ProductListing, RetailerConfig, ScrapeResult } from '../types';
import { parseSize } from '../utils';
import logger from '../logger';

interface ShopifyVariant {
  id: number;
  title: string;
  price: string;
  available: boolean;
  url: string;
}

interface ShopifyProduct {
  title: string;
  vendor: string;
  url: string;
  image: string;
  available: boolean;
  variants: ShopifyVariant[];
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

/**
 * Builds a human-readable label describing what a listing actually is —
 * "100ml", "3.4 oz", "Sample", "Tester", etc. Prefers the variant title,
 * then a size parsed from the product title, then a descriptor word.
 */
function buildVariantLabel(variantTitle: string | undefined, productTitle: string, sizeMl: number | null): string | null {
  const vt = (variantTitle ?? '').trim();
  if (vt && vt.toLowerCase() !== 'default title') return vt;

  if (sizeMl) {
    const oz = (sizeMl / 29.5735).toFixed(1);
    return `${sizeMl}ml / ${oz} oz`;
  }

  // No size — try to label samples/testers from the product title
  const lower = productTitle.toLowerCase();
  if (lower.includes('sample') || lower.includes('decant')) return 'Sample';
  if (lower.includes('travel')) return 'Travel Spray';
  if (lower.includes('tester')) return 'Tester';
  if (lower.includes('miniature') || lower.includes('mini ')) return 'Miniature';
  return null;
}

export class ShopifyScraper extends BaseScraper {
  private storePage: Page | null = null;

  constructor(config: RetailerConfig) {
    super(config);
  }

  override async close(): Promise<void> {
    this.storePage = null;
    await super.close();
  }

  /** A page on the store that has passed the Cloudflare check (browser mode only). */
  private async clearedPage(): Promise<Page> {
    if (this.storePage) return this.storePage;
    const page = await this.newPage();
    await page.goto(this.config.base_url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => !/just a moment/i.test(document.title), undefined, { timeout: 45_000 });
    this.storePage = page;
    return page;
  }

  private async getJson<T>(url: string): Promise<T> {
    if (!this.usesBrowser) {
      const { data } = await axios.get<T>(url, { headers: HEADERS, timeout: 15_000 });
      return data;
    }
    const page = await this.clearedPage();
    const res = await page.evaluate(async (u) => {
      const r = await fetch(u, { headers: { Accept: 'application/json' }, credentials: 'include' });
      return { status: r.status, text: await r.text() };
    }, url);
    if (res.status !== 200) throw new Error(`HTTP ${res.status} for ${url}`);
    return JSON.parse(res.text) as T;
  }

  /** Runs fn with a browser open when this store needs one and the caller hasn't opened it. */
  private async withBrowser<T>(fn: () => Promise<T>): Promise<T> {
    const ownBrowser = this.usesBrowser && !this.context;
    if (ownBrowser) await this.launch();
    try {
      return await fn();
    } finally {
      if (ownBrowser) await this.close();
    }
  }

  async searchProducts(query: string): Promise<ProductListing[]> {
    const url = `${this.config.base_url}/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=20`;
    const products: ProductListing[] = [];

    try {
      const data = await this.getJson<{ resources: { results: { products: ShopifyProduct[] } } }>(url);

      const items = data?.resources?.results?.products ?? [];

      for (const item of items) {
        const variants = item.variants ?? [];
        const available = variants.filter((v) => v.available);
        const best = available.length > 0 ? available[0] : variants[0];

        // Some stores return empty variants array — fall back to top-level price
        const price = best ? parseFloat(best.price) : parseFloat((item as any).price);
        if (!price) continue;

        const sizeSource = best?.title ?? item.title;
        const sizeMl = parseSize(sizeSource).ml ?? parseSize(item.title).ml;
        const productUrl = best ? this.config.base_url + best.url : this.config.base_url + item.url;
        const imageUrl = (item as any).featured_image?.url ?? item.image ?? null;

        products.push({
          name: item.title,
          brand: item.vendor || query,
          price,
          currency: this.config.currency,
          size_ml: sizeMl,
          variant_label: buildVariantLabel(best?.title, item.title, sizeMl),
          url: productUrl,
          image_url: imageUrl,
          in_stock: best ? best.available : item.available,
        });
      }
    } catch (err) {
      logger.warn({ retailer: this.config.key, err }, 'shopify search failed');
    }

    return products;
  }

  // No browser launch/close per call unless the store needs one (withBrowser)
  override async scrapeSearch(query: string): Promise<ScrapeResult> {
    const start = Date.now();
    let products: ProductListing[] = [];
    let error: string | undefined;
    let success = false;

    try {
      products = await this.withBrowser(() => this.searchProducts(query));
      success = true;
      logger.info({ retailer: this.config.key, query, count: products.length }, 'Scrape complete');
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      logger.error({ retailer: this.config.key, query, error }, 'Scrape failed');
    }

    return {
      retailer_key: this.config.key,
      query,
      products,
      scraped_at: new Date(),
      success,
      error,
      duration_ms: Date.now() - start,
    };
  }

  override async scrapeUrl(url: string): Promise<ScrapeResult> {
    const start = Date.now();
    const product = await this.withBrowser(() => this.scrapeProductPage(url)).catch(() => null);
    return {
      retailer_key: this.config.key,
      query: url,
      products: product ? [product] : [],
      scraped_at: new Date(),
      success: product !== null,
      error: product ? undefined : 'product not found',
      duration_ms: Date.now() - start,
    };
  }

  async scrapeProductPage(url: string): Promise<ProductListing | null> {
    const handle = url.match(/\/products\/([^?#/]+)/)?.[1];
    if (!handle) return null;

    try {
      const data = await this.getJson<any>(`${this.config.base_url}/products/${handle}.js`);

      const variants: ShopifyVariant[] = data.variants ?? [];
      // Tracked URLs pin a specific variant (size) — price that one, not whichever
      // variant happens to be first, or a 100ml listing picks up the 50ml price.
      const variantId = url.match(/[?&]variant=(\d+)/)?.[1];
      const pinned = variantId ? variants.find((v) => String(v.id) === variantId) : undefined;
      const available = variants.filter((v) => v.available);
      const best = pinned ?? available[0] ?? variants[0];
      if (!best) return null;

      // product.js prices are in cents
      const price = parseFloat(best.price) / 100;
      const sizeMl = parseSize(best.title).ml ?? parseSize(data.title).ml;

      return {
        name: data.title,
        brand: data.vendor,
        price,
        currency: this.config.currency,
        size_ml: sizeMl,
        variant_label: buildVariantLabel(best.title, data.title, sizeMl),
        url: `${this.config.base_url}/products/${handle}?variant=${best.id}`,
        image_url: data.featured_image ?? null,
        in_stock: best.available,
      };
    } catch (err) {
      logger.warn({ url, err }, 'shopify product page scrape failed');
      return null;
    }
  }
}
