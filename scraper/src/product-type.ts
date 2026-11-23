/**
 * Works out what a retailer listing actually is from its title and URL, so a
 * body lotion or hair mist is never shown as the perfume itself.
 *
 * Returns a short label such as "Body lotion", or null for the fragrance
 * itself (eau de parfum, eau de toilette, extrait, perfume oil, testers,
 * travel sprays and samples all count as the fragrance).
 */
import { phraseText } from './utils';

// Checked in order: the first match wins, so more specific phrases come first.
const PRODUCT_TYPES: [label: string, phrases: string[]][] = [
  ['Gift set', ['gift set', 'giftset', 'coffret', 'set', 'kit', 'duo', 'trio', '2 pc', '3 pc', '4 pc', '2 piece', '3 piece', '4 piece', '2pc', '3pc', '4pc']],
  ['Hair mist', ['hair mist', 'hair perfume', 'hair fragrance', 'hair spray', 'hair parfum', 'parfum cheveux']],
  ['Body mist', ['body mist', 'body spray', 'fragrance mist', 'perfume mist', 'scented mist', 'brume']],
  ['Aftershave', ['after shave', 'aftershave', 'apres rasage']],
  ['Hand cream', ['hand cream', 'hand lotion', 'hand wash', 'hand cleanser', 'hand balm']],
  ['Body lotion', ['body lotion', 'body milk', 'body cream', 'body creme', 'body butter', 'body balm', 'body moisturizer', 'lotion', 'moisturizer', 'moisturiser']],
  ['Body wash', ['body wash', 'shower gel', 'shower cream', 'shower oil', 'bath gel', 'bath and shower', 'bath shower', 'bath oil', 'bath foam', 'bubble bath', 'gel douche', 'cleansing gel']],
  ['Body oil', ['body oil', 'dry oil', 'hair and body oil']],
  ['Deodorant', ['deodorant', 'deo stick', 'deo spray', 'antiperspirant', 'anti perspirant']],
  ['Shaving product', ['shaving', 'shave cream', 'shave gel', 'shave foam', 'pre shave', 'beard oil', 'beard balm']],
  ['Hair care', ['shampoo', 'conditioner', 'hair oil']],
  ['Soap', ['soap', 'bar soap']],
  ['Candle', ['candle', 'bougie']],
  ['Home fragrance', ['diffuser', 'reed diffuser', 'room spray', 'home spray', 'room mist', 'incense', 'linen spray']],
  ['Lip balm', ['lip balm']],
  ['Pouch or case', ['travel case', 'leather case', 'pouch', 'refill case']],
];

/** Phrases that look like the words above but mean the fragrance itself. */
const NOT_ACCESSORY = ['sunset', 'travel set', 'discovery set', 'sample set', 'tester set'];

/**
 * @param text listing title and/or URL (any case, any punctuation)
 * @param fragranceName the catalog name, so a word in it (say a scent called
 *   "Sunset Duo") is not mistaken for a product type
 */
export function classifyProductType(text: string, fragranceName = ''): string | null {
  let t = phraseText(text);
  // A product handle repeats the fragrance name; drop it so its words can't match
  const name = phraseText(fragranceName).trim();
  if (name) t = t.split(` ${name} `).join(' ');
  for (const safe of NOT_ACCESSORY) {
    if (t.includes(` ${safe} `)) return null;
  }
  for (const [label, phrases] of PRODUCT_TYPES) {
    if (phrases.some((p) => t.includes(` ${p} `))) return label;
  }
  return null;
}
