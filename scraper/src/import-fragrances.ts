/**
 * Imports a fragrance catalog from a CSV (e.g. a Fragrantica dataset off Kaggle).
 *
 * Flexible column matching — it auto-detects common header names, so most
 * Kaggle Fragrantica CSVs work without editing. Recognised columns:
 *   name    : name | perfume | title | fragrance
 *   brand   : brand | company | house | designer | maker
 *   gender  : gender | sex            ("for women", "for men", "unisex"...)
 *   type    : fragrance_type | type | concentration
 *   image   : image | image_url | img | picture | photo
 *   year    : year | release | release_year
 *   seasons : spring / summer / fall|autumn / winter   (vote count or %)
 *   accords : accords | main_accord | mainaccord1..5
 *
 * Usage (from scraper/):
 *   ts-node src/import-fragrances.ts data/fragrantica.csv
 *   ts-node src/import-fragrances.ts data/fragrantica.csv --limit 700
 *   ts-node src/import-fragrances.ts data/fragrantica.csv --dry        (preview only)
 */
import 'dotenv/config';
import * as fs from 'fs';
import { parse } from 'csv-parse/sync';
import { getPool } from './db/client';
import logger from './logger';

type Row = Record<string, string>;

function pick(row: Row, keys: string[]): string | undefined {
  for (const k of keys) {
    const found = Object.keys(row).find((h) => h.toLowerCase().trim() === k);
    if (found && row[found]?.trim()) return row[found].trim();
  }
  return undefined;
}

function normalizeGender(raw: string | undefined): 'male' | 'female' | 'unisex' | 'unknown' {
  if (!raw) return 'unknown';
  // Match whole words: "women" and "female" contain "men" and "male"
  const words = raw.toLowerCase().split(/[^a-z]+/);
  const hasW = words.some((w) => ['women', 'woman', 'female', 'her', 'w'].includes(w));
  const hasM = words.some((w) => ['men', 'man', 'male', 'him', 'm'].includes(w));
  if (words.includes('unisex') || (hasW && hasM)) return 'unisex';
  if (hasW) return 'female';
  if (hasM) return 'male';
  return 'unknown';
}

function toSeasonScore(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[^0-9.]/g, ''));
  if (isNaN(n)) return null;
  const score = n <= 1 ? Math.round(n * 100) : Math.round(n);
  return Math.max(0, Math.min(32767, score));
}

function parseAccords(row: Row): string[] | null {
  const single = pick(row, ['accords', 'main_accord', 'mainaccords', 'accord']);
  if (single) {
    return single.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  }
  const numbered: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const v = pick(row, [`mainaccord${i}`, `main_accord${i}`, `accord${i}`]);
    if (v) numbered.push(v);
  }
  return numbered.length ? numbered : null;
}

// Accord → seasonal affinity weights [spring, summer, fall, winter].
// Used to derive season scores when the dataset has no season votes.
const ACCORD_SEASONS: Record<string, [number, number, number, number]> = {
  citrus: [3, 4, 0, 0], fresh: [3, 4, 0, 0], aquatic: [2, 4, 0, 0], marine: [2, 4, 0, 0],
  ozonic: [2, 4, 0, 0], 'fresh spicy': [2, 3, 1, 0], aromatic: [3, 3, 1, 0], green: [4, 3, 0, 0],
  herbal: [3, 3, 1, 0], mentholic: [1, 4, 0, 0], mineral: [2, 3, 0, 0], salty: [1, 4, 0, 0],
  conifer: [2, 1, 1, 2], aldehydic: [3, 2, 1, 0], fruity: [3, 3, 1, 0], tropical: [2, 4, 0, 0],
  coconut: [2, 4, 0, 0], citrusy: [3, 4, 0, 0], floral: [4, 2, 1, 0], 'white floral': [3, 3, 1, 0],
  rose: [3, 1, 2, 1], jasmine: [3, 2, 1, 1], tuberose: [3, 2, 1, 1], violet: [3, 1, 1, 1],
  'yellow floral': [3, 3, 0, 0], lactonic: [3, 2, 1, 0], soapy: [3, 3, 0, 0], powdery: [3, 1, 2, 2],
  iris: [3, 1, 2, 2], musky: [2, 2, 2, 2], lavender: [3, 2, 1, 1], fougere: [3, 2, 2, 1],
  woody: [1, 1, 3, 3], 'warm spicy': [0, 0, 3, 4], amber: [0, 0, 3, 4], vanilla: [1, 1, 3, 4],
  sweet: [1, 2, 3, 3], gourmand: [0, 1, 3, 4], oriental: [0, 0, 3, 4], balsamic: [0, 0, 3, 4],
  leather: [0, 0, 3, 4], tobacco: [0, 0, 3, 4], oud: [0, 0, 3, 4], smoky: [0, 0, 3, 4],
  chocolate: [0, 0, 3, 4], coffee: [0, 0, 3, 4], caramel: [0, 1, 3, 4], honey: [1, 1, 3, 3],
  rum: [0, 0, 3, 4], cinnamon: [0, 0, 3, 4], nutty: [0, 0, 3, 3], almond: [1, 1, 3, 3],
  cacao: [0, 0, 3, 4], animalic: [0, 0, 3, 3], patchouli: [1, 1, 3, 3], sandalwood: [1, 1, 3, 3],
  earthy: [1, 1, 3, 2], mossy: [2, 1, 3, 1], chypre: [2, 2, 3, 1], 'soft spicy': [1, 1, 3, 3],
  cherry: [2, 2, 2, 2], anis: [1, 1, 2, 2], camphor: [1, 2, 1, 2],
};

function deriveSeasons(accords: string[] | null): [number, number, number, number] | null {
  if (!accords?.length) return null;
  const sum = [0, 0, 0, 0];
  let matched = 0;
  accords.forEach((a, idx) => {
    const w = ACCORD_SEASONS[a.toLowerCase().trim()];
    if (!w) return;
    matched++;
    const positionWeight = 5 - Math.min(idx, 4); // earlier accords count more
    for (let i = 0; i < 4; i++) sum[i] += w[i] * positionWeight;
  });
  if (!matched) return null;
  const max = Math.max(...sum) || 1;
  return sum.map((v) => Math.round((v / max) * 100)) as [number, number, number, number];
}

async function main() {
  const args = process.argv.slice(2);
  const csvPath = args.find((a) => !a.startsWith('--'));
  const dry = args.includes('--dry');
  const limitArg = parseInt(args[args.indexOf('--limit') + 1]) || 0;

  if (!csvPath || !fs.existsSync(csvPath)) {
    console.error('Provide a CSV path: ts-node src/import-fragrances.ts <file.csv> [--limit N] [--dry]');
    process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  // Auto-detect delimiter (Fragrantica/Kaggle CSVs are often semicolon-separated)
  const firstLine = raw.slice(0, raw.indexOf('\n'));
  const delimiter = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
  const rows: Row[] = parse(raw, { columns: true, delimiter, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });
  console.log(`Parsed ${rows.length} rows (delimiter "${delimiter}"). Headers: ${Object.keys(rows[0] ?? {}).join(', ')}\n`);

  const toImport = limitArg ? rows.slice(0, limitArg) : rows;
  const pool = getPool();
  let imported = 0;
  let skipped = 0;

  for (const row of toImport) {
    const name = pick(row, ['name', 'perfume', 'title', 'fragrance']);
    const brand = pick(row, ['brand', 'company', 'house', 'designer', 'maker']);
    if (!name || !brand) { skipped++; continue; }

    const gender = normalizeGender(pick(row, ['gender', 'sex']));
    const type = pick(row, ['fragrance_type', 'type', 'concentration']) ?? null;
    const image = pick(row, ['image', 'image_url', 'img', 'picture', 'photo', 'imageurl']) ?? null;
    const yearRaw = pick(row, ['year', 'release', 'release_year']);
    const year = yearRaw ? parseInt(yearRaw.replace(/[^0-9]/g, '')) || null : null;
    const accords = parseAccords(row);
    // Use explicit season columns if present, else derive from the main accords
    let spring = toSeasonScore(pick(row, ['spring']));
    let summer = toSeasonScore(pick(row, ['summer']));
    let fall = toSeasonScore(pick(row, ['fall', 'autumn']));
    let winter = toSeasonScore(pick(row, ['winter']));
    if (spring == null && summer == null && fall == null && winter == null) {
      const derived = deriveSeasons(accords);
      if (derived) [spring, summer, fall, winter] = derived;
    }

    if (dry) {
      if (imported < 8) console.log({ name, brand, gender, type, year, spring, summer, fall, winter, image: image?.slice(0, 40), accords });
      imported++;
      continue;
    }

    try {
      await pool.query(
        `INSERT INTO fragrances (name, brand, gender, fragrance_type, image_url, season_spring, season_summer, season_fall, season_winter, accords, year)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (name, brand) DO UPDATE SET
           gender = COALESCE(NULLIF(EXCLUDED.gender,'unknown'), fragrances.gender),
           fragrance_type = COALESCE(EXCLUDED.fragrance_type, fragrances.fragrance_type),
           image_url = COALESCE(EXCLUDED.image_url, fragrances.image_url),
           season_spring = COALESCE(EXCLUDED.season_spring, fragrances.season_spring),
           season_summer = COALESCE(EXCLUDED.season_summer, fragrances.season_summer),
           season_fall = COALESCE(EXCLUDED.season_fall, fragrances.season_fall),
           season_winter = COALESCE(EXCLUDED.season_winter, fragrances.season_winter),
           accords = COALESCE(EXCLUDED.accords, fragrances.accords),
           year = COALESCE(EXCLUDED.year, fragrances.year)`,
        [name, brand, gender, type, image, spring, summer, fall, winter, accords, year]
      );
      imported++;
      if (imported % 100 === 0) console.log(`  ...${imported} imported`);
    } catch (err) {
      logger.warn({ name, brand, err: (err as Error).message }, 'import row failed');
      skipped++;
    }
  }

  console.log(`\n${dry ? 'DRY RUN — ' : ''}Done. ${imported} fragrances ${dry ? 'previewed' : 'imported/updated'}, ${skipped} skipped.`);
  process.exit(0);
}

main().catch((err) => { logger.error({ err }, 'import-fragrances error'); process.exit(1); });
