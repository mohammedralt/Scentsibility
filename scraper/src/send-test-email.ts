/**
 * Sends a sample price alert so you can check email is set up.
 *
 * Usage: ts-node src/send-test-email.ts you@example.com
 */
import 'dotenv/config';
import { sendPriceAlert, emailConfigured } from './notifications/email';

async function main() {
  const to = process.argv[2]?.trim();
  if (!to || !to.includes('@')) {
    console.error('Usage: npm run test-email -- you@example.com');
    process.exit(1);
  }
  if (!emailConfigured()) {
    console.error('No email provider configured: set GMAIL_USER and GMAIL_APP_PASSWORD (or RESEND_API_KEY).');
    process.exit(1);
  }

  const appUrl = process.env.APP_URL ?? 'https://scentsibility.vercel.app';
  await sendPriceAlert({
    toEmail: to,
    fragranceName: 'Layton (test email)',
    brand: 'Parfums de Marly',
    retailerName: 'Scentsibility',
    price: 199.99,
    currency: 'USD',
    productUrl: appUrl,
    fragrancePageUrl: appUrl,
    threshold: 210,
    previousBest: 229.99,
  });
  console.log(`✓ Test email sent to ${to}`);
}

main().catch((err) => {
  console.error(`✗ Sending failed: ${(err as Error).message}`);
  process.exit(1);
});
