export type Currency = 'USD' | 'CAD';

export interface ProductListing {
  name: string;
  brand: string;
  price: number;
  currency: Currency;
  size_ml: number | null;
  variant_label: string | null;
  url: string;
  image_url: string | null;
  in_stock: boolean;
}

export interface ScrapeResult {
  retailer_key: string;
  query: string;
  products: ProductListing[];
  scraped_at: Date;
  success: boolean;
  error?: string;
  duration_ms: number;
}

export interface RetailerConfig {
  key: string;
  name: string;
  base_url: string;
  currency: Currency;
  search_url_template: string;
  /** Behind a Cloudflare "Just a moment..." check: fetch through a real (stealth) browser */
  use_browser?: boolean;
}

// What gets stored in the DB for a tracked product
export interface TrackedProduct {
  id: string;
  fragrance_id: string;
  retailer_key: string;
  product_url: string;
  last_price: number | null;
  last_scraped_at: Date | null;
}

// BullMQ job payloads
export interface ScrapeJobPayload {
  tracked_product_id: string;
  retailer_key: string;
  product_url: string;
  fragrance_id: string;
}

export interface SearchJobPayload {
  query: string;
  retailer_keys: string[];
}

// Parsed size from product name/description strings like "3.4 oz", "100ml", "100 ml"
export interface ParsedSize {
  ml: number | null;
  oz: number | null;
  raw: string;
}
