import type { Metadata } from 'next';
import './globals.css';
import { Header } from '@/components/Header';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Scentsibility — Compare Fragrance Prices', template: '%s | Scentsibility' },
  description: 'Track prices on your favourite fragrances across all major retailers. Get alerts when prices drop.',
  openGraph: {
    siteName: 'Scentsibility',
    type: 'website',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen flex flex-col">
        <Header session={session} />
        <main className="flex-1">{children}</main>
        <footer className="border-gray-800 py-8 mt-16">
          <div className="max-w-6xl mx-auto px-4 text-center text-sm text-gray-500">
            © {new Date().getFullYear()} Scentsibility — Prices updated every 12 hours.
            Not affiliated with any retailer.
            <div className="mt-3 flex justify-center gap-5">
              <Link href="/privacy" className="hover:text-gray-300">Privacy</Link>
              <Link href="/terms" className="hover:text-gray-300">Terms</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
