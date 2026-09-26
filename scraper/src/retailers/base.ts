import { Browser, BrowserContext, Page } from 'playwright';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { ProductListing, RetailerConfig, ScrapeResult } from '../types';
import { parseSize, parsePrice } from '../utils';
import logger from '../logger';

chromium.use(StealthPlugin());

// Realistic desktop UA — rotate if you start getting blocked
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
];

export abstract class BaseScraper {
  protected config: RetailerConfig;
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;

  constructor(config: RetailerConfig) {
    this.config = config;
  }

  /** Whether this retailer is scraped through a browser (callers keep one open for a batch) */
  get usesBrowser(): boolean {
    return !!this.config.use_browser;
  }

  private randomUA(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  async launch(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1366,768',
      ],
    });

    this.context = await this.browser.newContext({
      userAgent: this.randomUA(),
      viewport: { width: 1366, height: 768 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
    });

    // Remove the webdriver flag that basic bot detection looks for
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).chrome;
    });
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.context = null;
    this.browser = null;
  }

  protected async newPage(): Promise<Page> {
    if (!this.context) throw new Error('Browser not launched — call launch() first');
    const page = await this.context.newPage();

    // Abort image/font requests to speed up scraping
    await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,ico,woff,woff2,ttf,eot}', (route) =>
      route.abort()
    );

    return page;
  }

  protected buildSearchUrl(query: string): string {
    return this.config.search_url_template.replace('{query}', encodeURIComponent(query));
  }

  protected randomDelay(minMs = 800, maxMs = 2200): Promise<void> {
    const ms = Math.floor(Math.random() * (maxMs - minMs) + minMs);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected parseSize(text: string) {
    return parseSize(text);
  }

  protected parsePrice(text: string): number | null {
    return parsePrice(text);
  }

  // Each retailer implements these two methods
  abstract searchProducts(query: string): Promise<ProductListing[]>;
  abstract scrapeProductPage(url: string): Promise<ProductListing | null>;

  async scrapeSearch(query: string): Promise<ScrapeResult> {
    const start = Date.now();
    let products: ProductListing[] = [];
    let error: string | undefined;
    let success = false;

    try {
      await this.launch();
      products = await this.searchProducts(query);
      success = true;
      logger.info({ retailer: this.config.key, query, count: products.length }, 'Scrape complete');
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      logger.error({ retailer: this.config.key, query, error }, 'Scrape failed');
    } finally {
      await this.close();
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

  async scrapeUrl(url: string): Promise<ScrapeResult> {
    const start = Date.now();
    let products: ProductListing[] = [];
    let error: string | undefined;
    let success = false;

    try {
      await this.launch();
      const product = await this.scrapeProductPage(url);
      if (product) products = [product];
      success = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      logger.error({ retailer: this.config.key, url, error }, 'URL scrape failed');
    } finally {
      await this.close();
    }

    return {
      retailer_key: this.config.key,
      query: url,
      products,
      scraped_at: new Date(),
      success,
      error,
      duration_ms: Date.now() - start,
    };
  }
}
