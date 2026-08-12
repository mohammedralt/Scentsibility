'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Search, Bell, User, LogOut, Menu, X } from 'lucide-react';
import type { Session } from 'next-auth';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';

interface HeaderProps {
  session: Session | null;
}

export function Header({ session }: HeaderProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [, startTransition] = useTransition();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    startTransition(() => {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
        {/* Logo */}
        <Link href="/" className="flex-shrink-0 font-bold text-lg text-brand-700 dark:text-brand-400 tracking-tight">
          Scentsibility
        </Link>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex-1 max-w-xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search fragrances, brands…"
              className={cn(
                'input pl-9 pr-4 py-2 h-9 text-sm',
                'focus:ring-1'
              )}
            />
          </div>
        </form>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-1 ml-auto">
          <Link href="/search" className="btn-ghost text-sm">Browse</Link>
          {session ? (
            <>
              <Link href="/dashboard" className="btn-ghost">
                <Bell className="h-4 w-4" />
                Watchlist
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="btn-ghost text-gray-500"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost">Sign in</Link>
              <Link href="/register" className="btn-primary">Get started</Link>
            </>
          )}
        </nav>

        {/* Mobile menu toggle */}
        <button
          className="md:hidden btn-ghost p-2 ml-auto"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 py-3 flex flex-col gap-2">
          {session ? (
            <>
              <Link href="/dashboard" className="btn-ghost justify-start" onClick={() => setMenuOpen(false)}>
                <Bell className="h-4 w-4" /> Watchlist
              </Link>
              <button onClick={() => signOut({ callbackUrl: '/' })} className="btn-ghost justify-start text-gray-500">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost justify-start" onClick={() => setMenuOpen(false)}>Sign in</Link>
              <Link href="/register" className="btn-primary justify-start" onClick={() => setMenuOpen(false)}>Get started</Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
