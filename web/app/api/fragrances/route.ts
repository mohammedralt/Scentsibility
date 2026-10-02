import { NextRequest, NextResponse } from 'next/server';
import { searchFragrances } from '@/lib/db';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  const requested = parseInt(req.nextUrl.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 50) : 20;

  try {
    const fragrances = await searchFragrances(q, limit);
    return NextResponse.json(fragrances);
  } catch {
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
