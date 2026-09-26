/**
 * Deletes tracked listings by id (their price history goes with them).
 * Dry run unless --confirm is passed. Ids come from a file, one per line;
 * anything after # is a comment.
 *
 * Usage: ts-node src/remove-listings.ts cleanup/remove-listings.txt [--confirm]
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { getPool } from './db/client';

async function main() {
  const file = process.argv[2];
  const confirm = process.argv.includes('--confirm');
  if (!file) throw new Error('Usage: remove-listings <file> [--confirm]');

  const ids = readFileSync(file, 'utf8').split('\n').map((l) => l.split('#')[0].trim()).filter(Boolean);
  const { rows } = await getPool().query(
    `SELECT tp.id, f.brand, f.name, r.key AS retailer, tp.product_url
     FROM tracked_products tp JOIN fragrances f ON f.id = tp.fragrance_id JOIN retailers r ON r.id = tp.retailer_id
     WHERE tp.id = ANY($1::uuid[])`,
    [ids]
  );
  for (const r of rows) console.log(`${confirm ? 'deleting' : 'would delete'}: ${r.brand} ${r.name} ← [${r.retailer}] ${r.product_url.split('?')[0]}`);
  console.log(`\n${rows.length} of ${ids.length} ids found${rows.length < ids.length ? ' (the rest are already gone)' : ''}`);

  if (confirm && rows.length) {
    const { rowCount } = await getPool().query(`DELETE FROM tracked_products WHERE id = ANY($1::uuid[])`, [rows.map((r) => r.id)]);
    console.log(`✓ Deleted ${rowCount} listings`);
  } else if (!confirm) {
    console.log('Dry run: nothing deleted. Pass --confirm to delete.');
  }
  await getPool().end();
}

main().catch((err) => { console.error(err); process.exit(1); });
