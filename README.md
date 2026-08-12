# Scentsibility
https://scentsibility.vercel.app/

A price comparison site for niche and designer fragrances. It scrapes prices from 10 online retailers, keeps them in one catalog, tracks how each price moves over time, and emails you when something on your watchlist hits a new best deal.

There are two parts: a scraper that collects the prices, and a Next.js web app that shows them. Both read and write the same Postgres database.

## How it works

### Collecting prices

Most of the stores run on Shopify. Shopify has a search endpoint at `/search/suggest.json` that returns product data as JSON, so for those stores I just hit that URL directly over HTTP. No browser, about 300ms per search. That covers 9 of the 10 retailers.

Jomashop was the hard one and took the most work. It is not a Shopify store, it runs on Magento with Algolia search, and the whole site sits behind Cloudflare. Plain HTTP requests get dropped because Cloudflare looks at the TLS handshake and can tell the request is not a real browser. The way I got past it was to drive an actual headless Chrome with Playwright and a stealth plugin: load the homepage first so Cloudflare hands over its clearance cookie, then load the search page and read the rendered product cards straight out of the page. I found the right approach by watching the network tab, seeing the search was Algolia backed, and realizing a real browser passes the check that a raw HTTP client fails.

Once results come back, every retailer gets mapped to the same shape (name, brand, price, size, in stock, image). A matching step lines each result up against the right fragrance in the catalog and throws out things that are not the perfume, like body wash, candles, and hair mist.

### The database

Three main tables do the work:

- `fragrances` is the catalog. One row per scent, with brand, gender, accords, and season scores.
- `tracked_products` is one row per fragrance at one retailer in one size. This is a specific listing.
- `price_snapshots` is one row every time a listing gets scraped. That history is what the price charts are built from.

Plus `retailers`, `users`, `watchlist_items`, and a log of sent notifications.

### Updating prices

The scraper has a scheduler and a worker that talk through a Redis queue (BullMQ on Upstash). Every 12 hours the scheduler drops one job per tracked product onto the queue, and the worker pulls jobs off, re-scrapes each one, and writes a new snapshot. The worker also checks whether anyone is watching that fragrance and sends alerts when a price crosses their target.

One honest caveat: this only runs while the scheduler and worker processes are alive. On a laptop that means only when the machine is on. For real round the clock updates you would deploy those two processes to a host that stays up, like Railway or Render.

### Accounts and price alerts

Sign up creates a user with a bcrypt hashed password. Login uses NextAuth with JWT sessions. Once you are logged in, the "Track price" button on any fragrance adds it to your watchlist, and you can optionally set a target price ceiling. The worker compares the cheapest price across all of a fragrance's tracked retailers before and after every scrape, and fires an alert only when that scrape sets a new all time low (and clears your target, if you set one), capped at one email per fragrance per day. It sends through Resend and logs that it did so. Sending needs a real `RESEND_API_KEY`; reaching any inbox other than your own Resend account address needs a verified sender domain.

## Tech stack

- Scraper: TypeScript, Playwright, Axios, BullMQ, Postgres (pg)
- Web: Next.js 14 (App Router), React server components, Tailwind, Recharts, NextAuth
- Data: Postgres on Supabase, Redis on Upstash
- Email: Resend
  

## Running it locally

You need a Postgres database (Supabase works) and a Redis instance (Upstash works).

Scraper:

```
cd scraper
npm install
npm run install:browsers      # one time, for Playwright
# create .env with DATABASE_URL and the REDIS_* vars
```

Set up the schema by running `src/db/schema.sql` in the database, then `src/db/seed.sql` for a starter catalog.

Pull prices:

```
npm run populate              # scrape all retailers for every fragrance
npm run scrape -- jomashop "creed aventus"   # test one retailer
```

Run the 12 hour pipeline:

```
npm run worker                # processes scrape jobs
npm run scheduler             # queues jobs every 12 hours
```

Web app:

```
cd web
npm install
# create .env.local with DATABASE_URL, AUTH_SECRET, NEXTAUTH_URL
npm run dev                   # http://localhost:3000
```

## Adding more fragrances

The catalog can be loaded from a CSV, for example a Fragrantica dataset off Kaggle. The importer matches common column names on its own, so most files work without editing.

```
cd scraper
npm run import -- data/fragrances.csv --dry     # preview the mapping first
npm run import -- data/fragrances.csv --limit 700
npm run populate                                 # then scrape prices and images
```

If the file has no season columns, the importer works out season scores from each fragrance's main accords (warm notes like vanilla and amber lean fall and winter, fresh notes like citrus and aquatic lean spring and summer).

## Retailers

Working: FragFlex, Beauty House, Arvella, Aura, Venba, Olfactory Factory, Fragrance Nevaeh, Emnt Scents, Fragrance Lord, and Jomashop.

FragranceNet is skipped because its Cloudflare setup is harder to get through than it is worth right now.
