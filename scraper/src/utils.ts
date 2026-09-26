import { ParsedSize } from './types';

/**
 * Extracts a numeric price from strings like "$54.99", "CAD 89.00", "54.99"
 */
export function parsePrice(text: string): number | null {
  const match = text.replace(/,/g, '').match(/[\d]+\.[\d]{1,2}/);
  if (!match) return null;
  const value = parseFloat(match[0]);
  return isNaN(value) ? null : value;
}

/**
 * Parses size strings like "3.4 oz / 100 ml", "100ml", "1.7oz", "50 ML"
 * Returns both ml and oz values when available.
 */
export function parseSize(text: string): ParsedSize {
  const normalized = text.toLowerCase().trim();
  const result: ParsedSize = { ml: null, oz: null, raw: text };

  const mlMatch = normalized.match(/([\d.]+)\s*ml/);
  if (mlMatch) result.ml = parseFloat(mlMatch[1]);

  const ozMatch = normalized.match(/([\d.]+)\s*oz/);
  if (ozMatch) {
    result.oz = parseFloat(ozMatch[1]);
    // If we didn't get ml from the string, convert from oz
    if (!result.ml) result.ml = Math.round(result.oz * 29.5735);
  }

  return result;
}

/**
 * Normalizes a fragrance name for matching across retailers.
 * e.g. "BLEU DE CHANEL Eau de Parfum" → "bleu de chanel eau de parfum"
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Adds a random delay to avoid rate limiting (call between page actions).
 */
export function randomDelay(minMs = 500, maxMs = 1500): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs) + minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Clamps a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Lowercases, strips accents, turns punctuation into spaces and pads with
 * spaces, so names can be matched as whole-word phrases:
 * "Acqua di Giò" → " acqua di gio ", "creed-royal-oud" → " creed royal oud ".
 */
export function phraseText(text: string): string {
  return ` ${text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}
