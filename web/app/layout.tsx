import type { Metadata } from 'next';
import { Instrument_Serif, Manrope } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/Header';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { SITE_URL } from '@/lib/site';

const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-serif' });
const sans = Manrope({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Scentsibility: Compare Fragrance Prices', template: '%s | Scentsibility' },
  description: 'Track prices on your favourite fragrances across all major retailers. Get alerts when prices drop.',
  openGraph: {
    siteName: 'Scentsibility',
    type: 'website',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <html lang="en" suppressHydrationWarning className={`${serif.variable} ${sans.variable}`}>
      <body className="min-h-screen flex flex-col">
        <Header session={session} />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-gray-900 mt-24">
          <div className="max-w-6xl mx-auto px-4 py-10 flex flex-col sm:flex-row sm:items-end justify-between gap-6 text-sm text-gray-500">
            <div>
              <p className="font-serif text-2xl text-gray-200">Scentsibility</p>
              <p className="mt-1">Prices refresh twice a day. Not affiliated with any store.</p>
            </div>
            <div className="flex gap-6">
              <Link href="/search" className="hover:text-gray-200">Browse</Link>
              <Link href="/privacy" className="hover:text-gray-200">Privacy</Link>
              <Link href="/terms" className="hover:text-gray-200">Terms</Link>
              <span>© {new Date().getFullYear()}</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
