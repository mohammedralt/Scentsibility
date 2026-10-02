export type Currency = 'USD' | 'CAD';

export interface Fragrance {
  id: string;
  name: string;
  brand: string;
  gender: 'male' | 'female' | 'unisex' | 'unknown';
  fragrance_type: string | null;
  image_url: string | null;
  season_spring: number | null;
  season_summer: number | null;
  season_fall: number | null;
  season_winter: number | null;
  accords: string[] | null;
  year: number | null;
  created_at: string;
}

export interface Retailer {
  id: string;
  key: string;
  name: string;
  base_url: string;
  currency: Currency;
}

export interface TrackedProduct {
  id: string;
  fragrance_id: string;
  retailer_id: string;
  retailer_key: string;
  retailer_name: string;
  product_url: string;
  size_ml: number | null;
  variant_label: string | null;
  is_tester: boolean;
  last_price: number | null;
  last_in_stock: boolean | null;
  last_scraped_at: string | null;
  currency: Currency;
}

export interface PriceSnapshot {
  price: number;
  currency: Currency;
  in_stock: boolean;
  scraped_at: string;
}

export interface FragranceWithPrices extends Fragrance {
  listings: TrackedProduct[];
  cheapest: TrackedProduct | null;
}

export interface WatchlistItem {
  id: string;
  fragrance_id: string;
  fragrance_name: string;
  fragrance_brand: string;
  fragrance_image: string | null;
  alert_threshold: number | null;
  notify_email: boolean;
  cheapest_price: number | null;
  cheapest_retailer: string | null;
  cheapest_currency: Currency | null;
  created_at: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}
