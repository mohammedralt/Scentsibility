import type { Metadata } from 'next';
import './globals.css';
import { Header } from '@/components/Header';
import { auth } from '@/lib/auth';

export const metadata: Metadata = {
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
        <footer className="border-t border-gray-200 dark:border-gray-800 py-8 mt-16">
          <div className="max-w-6xl mx-auto px-4 text-center text-sm text-gray-500">
            © {new Date().getFullYear()} Scentsibility — Prices updated every 12 hours.
            Not affiliated with any retailer.
          </div>
        </footer>
      </body>
    </html>
  );
}
