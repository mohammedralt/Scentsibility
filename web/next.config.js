const { IMAGE_HOSTS } = require('./lib/image-hosts');

/** @type {import('next').NextConfig} */
const config = {
  images: {
    // Only resize images from the retailers and catalog we actually use, so
    // nobody else can run their images through this site's Vercel quota.
    remotePatterns: IMAGE_HOSTS.flatMap((host) => [
      { protocol: 'https', hostname: host },
      { protocol: 'https', hostname: `**.${host}` },
    ]),
  },
};

module.exports = config;
