// Public site URL, used for absolute links (emails, sitemap, social previews)
export const SITE_URL = (process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? 'https://scentsibility.vercel.app').replace(/\/$/, '');

export const SITE_NAME = 'Scentsibility';

// Where people can reach you about their data. Set CONTACT_EMAIL in Vercel.
export const CONTACT_EMAIL = process.env.CONTACT_EMAIL ?? null;
