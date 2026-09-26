'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2 } from 'lucide-react';

export function RemoveWatchlistButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRemove() {
    startTransition(async () => {
      await fetch(`/api/watchlist/${itemId}`, { method: 'DELETE' });
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleRemove}
      disabled={isPending}
      className="btn-ghost py-1.5 px-2.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-950/30"
      aria-label="Remove from watchlist"
    >
      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}
