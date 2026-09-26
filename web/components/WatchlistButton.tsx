'use client';

import { useState, useTransition } from 'react';
import { Bell, BellOff, BellRing, Loader2, X } from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils';

interface WatchlistButtonProps {
  fragranceId: string;
  isWatching: boolean;
  watchlistItemId?: string;
  alertThreshold?: number | null;
  isLoggedIn: boolean;
}

export function WatchlistButton({
  fragranceId,
  isWatching: initialWatching,
  watchlistItemId,
  alertThreshold: initialThreshold = null,
  isLoggedIn,
}: WatchlistButtonProps) {
  const [watching, setWatching] = useState(initialWatching);
  const [itemId, setItemId] = useState(watchlistItemId);
  const [threshold, setThreshold] = useState<number | null>(initialThreshold);
  const [formOpen, setFormOpen] = useState(false);
  const [target, setTarget] = useState(initialThreshold?.toString() ?? '');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  if (!isLoggedIn) {
    const callbackUrl = encodeURIComponent(`/fragrance/${fragranceId}`);
    return (
      <>
        <a href={`/register?callbackUrl=${callbackUrl}`} className="btn-primary">
          <Bell className="h-4 w-4" />
          Track price
        </a>
        <a href={`/login?callbackUrl=${callbackUrl}`} className="btn-ghost">
          Sign in to set alerts
        </a>
      </>
    );
  }

  // Adding an item that's already watched just updates its threshold (upsert)
  async function save(alertThreshold: number | null): Promise<boolean> {
    const res = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fragrance_id: fragranceId, alert_threshold: alertThreshold }),
    });
    if (!res.ok) {
      setError('Could not save. Please try again.');
      return false;
    }
    const data = await res.json();
    setWatching(true);
    setItemId(data.id);
    setThreshold(data.alert_threshold != null ? Number(data.alert_threshold) : null);
    return true;
  }

  function toggle() {
    setError('');
    startTransition(async () => {
      if (watching && itemId) {
        const res = await fetch(`/api/watchlist/${itemId}`, { method: 'DELETE' });
        if (!res.ok) {
          setError('Could not remove. Please try again.');
          return;
        }
        setWatching(false);
        setItemId(undefined);
        setThreshold(null);
        setTarget('');
        setFormOpen(false);
      } else {
        await save(null);
      }
    });
  }

  function submitAlert(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const value = target.trim() === '' ? null : parseFloat(target);
    if (value !== null && (!Number.isFinite(value) || value <= 0)) {
      setError('Enter a price above $0, or leave it blank for any new low.');
      return;
    }
    startTransition(async () => {
      if (await save(value)) setFormOpen(false);
    });
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={toggle}
          disabled={isPending}
          className={cn('btn-primary gap-2', watching && 'bg-green-600 hover:bg-green-700')}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : watching ? (
            <BellOff className="h-4 w-4" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          {watching ? 'Watching' : 'Track price'}
        </button>
        <button
          onClick={() => setFormOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-700 bg-gray-900 text-gray-200 text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          <BellRing className="h-4 w-4" />
          {threshold != null ? `Alert at ${formatPrice(threshold, 'USD')}` : 'Set Price Alert'}
        </button>
      </div>

      {formOpen && (
        <form onSubmit={submitAlert} className="flex flex-wrap items-center gap-2 max-w-md">
          <div className="relative w-36">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Any new low"
              className="input pl-7 py-2 text-sm"
              aria-label="Target price in USD"
              autoFocus
            />
          </div>
          <button type="submit" disabled={isPending} className="btn-primary py-2">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save alert'}
          </button>
          <button type="button" onClick={() => setFormOpen(false)} className="btn-ghost p-2" aria-label="Cancel">
            <X className="h-4 w-4" />
          </button>
          <p className="w-full text-xs text-gray-500">
            We&apos;ll email you when this hits a new lowest price
            {target.trim() ? ` at or below $${target}` : ''}.
          </p>
        </form>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
