import { BaseScraper } from './base';
import { ProductListing, RetailerConfig } from '../types';
import { parseSize } from '../utils';
import logger from '../logger';

const CONFIG: RetailerConfig = {
  key: 'jomashop',
  name: 'Jomashop',
  base_url: 'https://www.jomashop.com',
  currency: 'USD',
  search_url_template: 'https://www.jomashop.com/search?q={query}',
  use_browser: true,
};

/**
 * Jomashop is Magento + Algolia InstantSearch behind Cloudflare.
 * A real (stealth) Chrome passes Cloudflare where plain HTTP gets dropped on
 * the TLS fingerprint. We load the homepage first to obtain the cf_clearance
 * cookie, then hit the search page and scrape the rendered `.ais-Hits-item`
 * cards (no API keys needed).
 */
export class JomashopScraper extends BaseScraper {
  constructor() {
    super(CONFIG);
  }

  async searchProducts(query: string): Promise<ProductListing[]> {
    const page = await this.newPage();
    const products: ProductListing[] = [];

    try {
      // 1. Clear Cloudflare on the homepage (sets cf_clearance cookie)
      await page.goto(CONFIG.base_url, { waitUntil: 'domcontentloaded', timeout: 40_000 });
      await this.randomDelay(1500, 2500);

      // 2. Run the search
      await page.goto(this.buildSearchUrl(query), { waitUntil: 'domcontentloaded', timeout: 40_000 });
      await page.waitForSelector('.ais-Hits-item', { timeout: 15_000 }).catch(() => null);
      await this.randomDelay(1200, 2000);

      const items = await page.evaluate(() => {
        const cards = document.querySelectorAll('.ais-Hits-item');
        return Array.from(cards).map((card) => {
          const block = card.querySelector('.productItemBlock') ?? card;
          const sku = block.getAttribute('data-sku') ?? '';
          const linkEl = card.querySelector('a.productImg-link, a[href$=".html"]') as HTMLAnchorElement | null;
          const href = linkEl?.getAttribute('href') ?? block.getAttribute('data-scroll-target') ?? '';
          const img = card.querySelector('img') as HTMLImageElement | null;
          const imgSrc = img?.getAttribute('src') ?? img?.getAttribute('data-src') ?? '';
          const altName = img?.alt?.trim() ?? '';

          // Collect exact "$123.45" price texts (excludes "$50.00 coupon" etc.)
          const prices: number[] = [];
          card.querySelectorAll('*').forEach((el) => {
            const t = el.textContent?.trim() ?? '';
            if (/^\$[\d,]+\.\d{2}$/.test(t)) prices.push(parseFloat(t.replace(/[$,]/g, '')));
          });

          return { sku, href, imgSrc, altName, prices };
        });
      });

      for (const item of items) {
        if (!item.href || item.prices.length === 0) continue;

        // Sale price = lowest of the displayed main prices (MSRP is the highest)
        const price = Math.min(...item.prices);
        if (!price) continue;

        // Derive brand from the URL slug: "creed-mens-..." → "creed",
        // "parfums-de-marly-mens-..." → "parfums de marly"
        const slug = item.href.replace(/^\/+/, '').replace(/\.html.*$/, '');
        const brandSlug = slug.split(/-(?:mens|womens|unisex|kids)-/i)[0] ?? '';
        const brand = brandSlug
          ? brandSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
          : query;

        // Clean the name: drop trailing "Fragrances <barcode>"
        const cleanName = item.altName.replace(/\s*Fragrances?\s*\d+\s*$/i, '').trim() || slug.replace(/-/g, ' ');
        const name = `${brand} ${cleanName}`.replace(/\s+/g, ' ').trim();

        const size = parseSize(item.altName);

        products.push({
          name,
          brand,
          price,
          currency: 'USD',
          size_ml: size.ml,
          variant_label: size.ml ? `${size.ml}ml / ${(size.ml / 29.5735).toFixed(1)} oz` : null,
          url: item.href.startsWith('http') ? item.href : CONFIG.base_url + item.href,
          image_url: item.imgSrc || null,
          in_stock: true,
        });
      }
    } catch (err) {
      logger.warn({ err }, 'jomashop search failed');
    } finally {
      await page.close();
    }

    return products;
  }

  async scrapeProductPage(url: string): Promise<ProductListing | null> {
    const page = await this.newPage();

    try {
      await page.goto(CONFIG.base_url, { waitUntil: 'domcontentloaded', timeout: 40_000 });
      await this.randomDelay(1000, 2000);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40_000 });
      await this.randomDelay(1000, 2000);

      const data = await page.evaluate(() => {
        const name = document.querySelector('h1')?.textContent?.trim() ?? '';
        const prices: number[] = [];
        document.querySelectorAll('[class*="price" i], span, div').forEach((el) => {
          const t = el.textContent?.trim() ?? '';
          if (/^\$[\d,]+\.\d{2}$/.test(t)) prices.push(parseFloat(t.replace(/[$,]/g, '')));
        });
        const img = document.querySelector('img[src*="catalog/product"]') as HTMLImageElement | null;
        const outOfStock = /out of stock|sold out/i.test(document.body.textContent ?? '');
        return { name, prices, imgSrc: img?.src ?? '', outOfStock };
      });

      if (!data.name || data.prices.length === 0) return null;
      const price = Math.min(...data.prices);
      const size = parseSize(data.name);

      return {
        name: data.name.replace(/\s*Fragrances?\s*\d+\s*$/i, '').trim(),
        brand: data.name.split(/\s+/)[0],
        price,
        currency: 'USD',
        size_ml: size.ml,
        variant_label: size.ml ? `${size.ml}ml / ${(size.ml / 29.5735).toFixed(1)} oz` : null,
        url,
        image_url: data.imgSrc || null,
        in_stock: !data.outOfStock,
      };
    } catch (err) {
      logger.warn({ url, err }, 'jomashop product page scrape failed');
      return null;
    } finally {
      await page.close();
    }
  }
}
