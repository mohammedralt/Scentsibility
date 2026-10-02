import { NextRequest, NextResponse } from 'next/server';
import { unsubscribe } from '@/lib/db';
import { SITE_URL } from '@/lib/site';

/**
 * Turns off price alert emails. Takes two kinds of POST:
 *  - the buttons on /unsubscribe (form fields `item` and `scope`)
 *  - one-click unsubscribe from Gmail/Apple Mail (RFC 8058), which posts
 *    `List-Unsubscribe=One-Click` to the URL in the email's header
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const item = String(form?.get('item') ?? req.nextUrl.searchParams.get('item') ?? '');

  if (form?.get('List-Unsubscribe') === 'One-Click') {
    await unsubscribe(item, 'all');
    return new NextResponse(null, { status: 200 });
  }

  const scope = form?.get('scope') === 'all' ? 'all' : 'one';
  const ok = await unsubscribe(item, scope);
  const done = ok ? `&done=${scope}` : '';
  return NextResponse.redirect(`${SITE_URL}/unsubscribe?item=${encodeURIComponent(item)}${done}`, 303);
}
