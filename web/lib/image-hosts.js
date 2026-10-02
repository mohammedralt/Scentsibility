// Image hosts that Vercel's image optimizer will resize. Shared by
// next.config.js and the image components (see canOptimizeImage in utils.ts).
// Images from any other host still show, they're just served unresized,
// so a missing host here never breaks the site.
const IMAGE_HOSTS = [
  'cdn.shopify.com',        // Shopify stores' product photos
  'fimgs.net',              // Fragrantica catalog images
  'jomashop.com',
  // Shopify retailers that serve photos from their own domain (/cdn/shop/...)
  'fragflex.com',
  'beautyhouse.com',
  'arvellafragrance.com',
  'aurafragrance.com',
  'venbafragrance.com',
  'olfactoryfactoryllc.com',
  'fragrance-nevaeh.com',
  'emntscents.com',
  'fragrancelord.com',
];

module.exports = { IMAGE_HOSTS };
