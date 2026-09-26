import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Currency } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number, currency: Currency): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(price);
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dateStr));
}

export function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatSize(ml: number | null): string {
  if (!ml) return 'Unknown size';
  const oz = (ml / 29.5735).toFixed(1);
  return `${ml}ml / ${oz} oz`;
}

// Only follow same-site paths after login, never "//evil.com" or "https://…"
export function safeCallbackUrl(value: string | null, fallback = '/dashboard'): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : fallback;
}

// Bottle photos we've composited onto the shared backdrop (see scraper/src/images)
export function isStagedImage(url: string | null | undefined): boolean {
  return !!url && url.startsWith('/bottles/');
}
