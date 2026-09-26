/**
 * Worker: picks up scrape jobs from BullMQ, runs the appropriate retailer scraper,
 * saves price snapshots, and fires email alerts when thresholds are crossed.
 *
 * Usage: ts-node src/queue/worker.ts
 */
import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { getScraper } from '../retailers/registry';
import { ScrapeJobPayload } from '../types';
import { recordPriceAndAlert } from '../notifications/alerts';
import logger from '../logger';

const QUEUE_NAME = 'scrape-jobs';
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY ?? '3');

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379'),
  password: process.env.REDIS_PASSWORD,
  ...(process.env.REDIS_TLS === 'true' && { tls: {} }),
};

async function processJob(job: Job<ScrapeJobPayload>): Promise<void> {
  const { tracked_product_id, retailer_key, product_url, fragrance_id } = job.data;
  logger.info({ jobId: job.id, retailer_key, product_url }, 'Processing scrape job');

  const scraper = getScraper(retailer_key);
  const result = await scraper.scrapeUrl(product_url);

  if (!result.success || result.products.length === 0) {
    logger.warn({ retailer_key, product_url, error: result.error }, 'Scrape returned no products');
    return;
  }

  const product = result.products[0];
  const { alertsSent } = await recordPriceAndAlert(tracked_product_id, fragrance_id, retailer_key, product);
  logger.info({ retailer_key, price: product.price, currency: product.currency, alertsSent }, 'Price recorded');
}

const worker = new Worker<ScrapeJobPayload>(QUEUE_NAME, processJob, {
  connection,
  concurrency: CONCURRENCY,
});

worker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Job completed');
});

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Job failed');
});

logger.info({ concurrency: CONCURRENCY }, 'Worker started');

process.on('SIGTERM', async () => {
  await worker.close();
  process.exit(0);
});
