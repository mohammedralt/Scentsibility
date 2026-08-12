-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Canonical fragrance catalog ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fragrances (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  brand        TEXT NOT NULL,
  gender       TEXT CHECK (gender IN ('male', 'female', 'unisex', 'unknown')) DEFAULT 'unknown',
  fragrance_type TEXT,                  -- EDT, EDP, EDC, Parfum, etc.
  image_url    TEXT,
  -- Fragrantica community season vote scores (relative size is what matters)
  season_spring SMALLINT,
  season_summer SMALLINT,
  season_fall   SMALLINT,
  season_winter SMALLINT,
  accords      TEXT[],
  year         SMALLINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, brand)
);

-- ─── Retailer registry ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retailers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key          TEXT UNIQUE NOT NULL,   -- matches registry.ts key (e.g. "fragrancenet")
  name         TEXT NOT NULL,
  base_url     TEXT NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USD',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO retailers (key, name, base_url, currency) VALUES
  ('fragrancenet',  'FragranceNet',       'https://www.fragrancenet.com',    'USD'),
  ('jomashop',      'Jomashop',           'https://www.jomashop.com',        'USD'),
  ('maxaroma',      'MaxAroma',           'https://www.maxaroma.com',        'USD'),
  ('fragrancebuy',  'FragranceBuy.ca',    'https://www.fragrancebuy.ca',     'CAD'),
  ('fragranceneveah','FragranceNeveah',   'https://www.fragranceneveah.com', 'USD'),
  ('venba',         'Venba Fragrance',    'https://www.venbafragrance.com',  'USD'),
  ('olfactory',     'Olfactory LLC',      'https://www.olfactoryllc.com',    'USD'),
  ('ediscount',     'eDiscountPerfumes',  'https://www.ediscountperfumes.com','USD'),
  ('fragrancelord', 'FragranceLord',      'https://www.fragrancelord.com',   'USD'),
  ('perfumespot',   'The Perfume Spot',   'https://www.theperfumespot.com',  'USD'),
  ('aura',          'Aura Fragrance',     'https://www.aurafragrance.com',   'USD')
ON CONFLICT (key) DO NOTHING;

-- ─── Specific product URLs we are tracking per retailer ─────────────────────
-- A "tracked product" is a (fragrance, retailer, URL) triple.
-- When a user adds a fragrance to their watchlist, we look up or create the
-- tracked_product row for each retailer.
CREATE TABLE IF NOT EXISTS tracked_products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fragrance_id  UUID NOT NULL REFERENCES fragrances (id) ON DELETE CASCADE,
  retailer_id   UUID NOT NULL REFERENCES retailers (id) ON DELETE CASCADE,
  product_url   TEXT NOT NULL,
  size_ml       INTEGER,
  variant_label TEXT,                  -- "100ml", "3.4 oz", "Sample", "Tester", etc.
  last_price    NUMERIC(10, 2),
  last_in_stock BOOLEAN,
  last_scraped_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fragrance_id, retailer_id, size_ml)
);

-- ─── Historical price snapshots ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS price_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracked_product_id UUID NOT NULL REFERENCES tracked_products (id) ON DELETE CASCADE,
  price             NUMERIC(10, 2) NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'USD',
  in_stock          BOOLEAN NOT NULL DEFAULT true,
  scraped_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_product_time
  ON price_snapshots (tracked_product_id, scraped_at DESC);

-- ─── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Watchlist items ─────────────────────────────────────────────────────────
-- A user watches a fragrance (not a specific retailer listing) and gets
-- notified when any retailer drops below their threshold.
CREATE TABLE IF NOT EXISTS watchlist_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  fragrance_id      UUID NOT NULL REFERENCES fragrances (id) ON DELETE CASCADE,
  alert_threshold   NUMERIC(10, 2),     -- null = notify on any new best deal; set = only once it's at/below this price
  notify_email      BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, fragrance_id)
);

-- ─── Notification log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications_sent (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  watchlist_item_id   UUID NOT NULL REFERENCES watchlist_items (id) ON DELETE CASCADE,
  tracked_product_id  UUID NOT NULL REFERENCES tracked_products (id) ON DELETE CASCADE,
  price_at_send       NUMERIC(10, 2) NOT NULL,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
