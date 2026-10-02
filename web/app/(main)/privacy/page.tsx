import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, ContactLine } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="October 2, 2026">
      <p>
        Scentsibility compares fragrance prices across online retailers and emails you when a fragrance you&apos;re
        tracking gets cheaper. This page explains what we collect to do that, and what we do with it.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Your account:</strong> your name, email address, and password. We never store the password itself, only a one-way scrambled version (a bcrypt hash) that can&apos;t be turned back into it.</li>
        <li><strong>Your watchlist:</strong> the fragrances you track, any target prices you set, and whether you want emails about them.</li>
        <li><strong>Emails we&apos;ve sent you:</strong> which price alerts went out and when, so we don&apos;t email you twice about the same deal.</li>
        <li><strong>Your IP address, briefly:</strong> when you sign in, sign up, or reset your password, we count attempts per IP address to stop people guessing passwords. These counts are deleted within about a day.</li>
      </ul>
      <p>
        Browsing the site doesn&apos;t need an account, and we don&apos;t collect anything about you while you browse.
        We don&apos;t use advertising or analytics trackers.
      </p>

      <h2>Cookies</h2>
      <p>
        We use one cookie, and only after you sign in: it keeps you signed in. We don&apos;t use cookies for
        advertising or to follow you around other sites.
      </p>

      <h2>How we use it</h2>
      <ul>
        <li>To run your account and show you your watchlist.</li>
        <li>To email you price alerts you asked for, and password reset links you request.</li>
        <li>To keep the site secure.</li>
      </ul>
      <p>We don&apos;t sell your information, and we don&apos;t send you marketing emails.</p>

      <h2>Who else handles it</h2>
      <p>We use a few services to run the site. They only process your information to provide their service to us:</p>
      <ul>
        <li><strong>Vercel</strong> hosts the website.</li>
        <li><strong>Supabase</strong> hosts the database where your account and watchlist are stored.</li>
        <li><strong>Google (Gmail)</strong> or <strong>Resend</strong> delivers our emails.</li>
        <li><strong>GitHub</strong> runs the job that checks prices and sends alerts.</li>
      </ul>
      <p>
        When you click through to a retailer, you&apos;re on their site, and their privacy policy applies. We don&apos;t
        tell retailers who you are.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your account and watchlist until you ask us to delete them. Price alert records are deleted with your
        account.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Turn off alert emails with the unsubscribe link in any alert, or by removing a fragrance from <Link href="/dashboard">your watchlist</Link>.</li>
        <li>Ask us for a copy of your information, to correct it, or to delete your account and everything tied to it. We&apos;ll do it within 30 days.</li>
      </ul>

      <h2>Children</h2>
      <p>Scentsibility isn&apos;t meant for children under 13, and we don&apos;t knowingly collect their information.</p>

      <h2>Changes</h2>
      <p>If we change this policy, we&apos;ll update the date at the top. If a change is significant, we&apos;ll email account holders.</p>

      <h2>Contact</h2>
      <ContactLine />
    </LegalPage>
  );
}
