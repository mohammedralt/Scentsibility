import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, ContactLine } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Terms of Use' };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="October 2, 2026">
      <p>
        These terms cover your use of Scentsibility. By using the site or creating an account, you agree to them.
        Our <Link href="/privacy">Privacy Policy</Link> explains how we handle your information.
      </p>

      <h2>What Scentsibility is</h2>
      <p>
        Scentsibility collects publicly listed prices from online fragrance retailers and shows them side by side. We
        don&apos;t sell anything. When you buy, you buy from the retailer, on their terms. Your order, payment,
        shipping, returns, and the authenticity of what you receive are between you and them.
      </p>
      <p>Scentsibility isn&apos;t affiliated with, endorsed by, or sponsored by any retailer or fragrance brand listed on the site.</p>

      <h2>Prices can be out of date</h2>
      <p>
        We check prices about every 12 hours, so a price or stock status may have changed since we last looked.
        Retailers can also list the wrong size, price, or product. Always check the price, size, and product on the
        retailer&apos;s site before you buy. We aren&apos;t responsible for differences between what we show and what
        a retailer charges.
      </p>

      <h2>Price alerts</h2>
      <p>
        Alerts are a convenience, not a guarantee. An alert can arrive late, or not at all, and a deal can end before
        you see it.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Give a real email address you can receive mail at.</li>
        <li>Keep your password to yourself. You&apos;re responsible for what happens under your account.</li>
        <li>One account per person.</li>
      </ul>

      <h2>Things you can&apos;t do</h2>
      <ul>
        <li>Copy our price data in bulk, or scrape or automatically harvest the site.</li>
        <li>Try to break into accounts, get around our security or rate limits, or disrupt the site.</li>
        <li>Use the site for anything illegal.</li>
      </ul>
      <p>We may suspend or delete accounts that break these terms.</p>

      <h2>Names and images</h2>
      <p>
        Fragrance names, brand names, logos, and product photos belong to their owners. We show them only to identify
        the products being compared.
      </p>

      <h2>No warranty</h2>
      <p>
        Scentsibility is provided &ldquo;as is&rdquo;, without warranties of any kind. We don&apos;t promise the site
        will always be available, error-free, or that its information is accurate or complete.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the extent the law allows, Scentsibility isn&apos;t liable for any loss from using the site or relying on
        its information, including paying more than a price we showed, missed deals, or problems with a retailer.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. We&apos;ll change the date at the top, and continuing to use the site means you
        accept the new terms. You can stop using the site and ask us to delete your account at any time.
      </p>

      <h2>Contact</h2>
      <ContactLine />
    </LegalPage>
  );
}
