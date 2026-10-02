/**
 * Email notifications. Sends through Gmail when GMAIL_USER and
 * GMAIL_APP_PASSWORD are set (free, no domain needed, ~500 emails/day),
 * otherwise through Resend when RESEND_API_KEY is set.
 */
import nodemailer from 'nodemailer';

interface PriceAlertParams {
  toEmail: string;
  fragranceName: string;
  brand: string;
  retailerName: string;
  price: number;
  currency: string;
  productUrl: string;
  fragrancePageUrl?: string | null;
  threshold: number | null;
  previousBest: number | null;
  /** Lets the email's unsubscribe link turn off this alert */
  watchlistItemId?: string;
}

interface Email {
  to: string;
  subject: string;
  html: string;
  /** One-click unsubscribe URL (RFC 8058), shown by Gmail and Apple Mail */
  unsubscribeUrl?: string;
}

export function emailConfigured(): boolean {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) || !!process.env.RESEND_API_KEY;
}

let gmail: nodemailer.Transporter | null = null;

export async function sendEmail({ to, subject, html, unsubscribeUrl }: Email): Promise<void> {
  const headers: Record<string, string> = unsubscribeUrl
    ? { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    : {};

  const gmailUser = process.env.GMAIL_USER;
  const gmailPassword = process.env.GMAIL_APP_PASSWORD;

  if (gmailUser && gmailPassword) {
    gmail ??= nodemailer.createTransport({
      service: 'gmail',
      // App passwords are shown with spaces ("abcd efgh ijkl mnop"); Gmail wants them without
      auth: { user: gmailUser.trim(), pass: gmailPassword.replace(/\s+/g, '') },
    });
    await gmail.sendMail({ from: `Scentsibility <${gmailUser.trim()}>`, to, subject, html, headers });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('No email provider configured (set GMAIL_USER + GMAIL_APP_PASSWORD, or RESEND_API_KEY)');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? 'onboarding@resend.dev', to: [to], subject, html, headers }),
  });
  if (!response.ok) {
    throw new Error(`Resend API error ${response.status}: ${await response.text()}`);
  }
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const money = (n: number) => `$${n.toFixed(2)}`;

export function renderPriceAlert(params: PriceAlertParams): Email {
  const name = escapeHtml(`${params.brand} ${params.fragranceName}`);
  const appUrl = process.env.APP_URL ?? 'https://scentsibility.vercel.app';
  const unsubscribeUrl = params.watchlistItemId
    ? `${appUrl}/unsubscribe?item=${params.watchlistItemId}`
    : undefined;
  const subject = `New best deal: ${params.brand} ${params.fragranceName} just hit ${money(params.price)}`;

  const details = [
    params.previousBest ? `Previous best ${money(params.previousBest)}` : null,
    params.threshold ? `Your target ${money(params.threshold)}` : null,
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#0e0d0c;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#f2f0ed">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0e0d0c;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#1c1a18;border:1px solid #2b2724;border-radius:16px">
        <tr><td style="padding:28px 28px 8px">
          <p style="margin:0 0 20px;font-weight:700;font-size:18px;color:#e4c47f">Scentsibility</p>
          <p style="margin:0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#a39c94">New best deal</p>
          <p style="margin:6px 0 0;font-size:20px;font-weight:600;color:#faf9f7">${name}</p>
          <p style="margin:14px 0 0;font-size:34px;font-weight:700;color:#faf9f7">${money(params.price)}</p>
          <p style="margin:4px 0 0;font-size:14px;color:#a39c94">at ${escapeHtml(params.retailerName)}</p>
          ${details ? `<p style="margin:12px 0 0;font-size:13px;color:#a39c94">${details}</p>` : ''}
        </td></tr>
        <tr><td style="padding:20px 28px 8px">
          <a href="${params.productUrl}" style="display:inline-block;background:#e4c47f;color:#0e0d0c;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px">View deal</a>
          ${params.fragrancePageUrl ? `<a href="${params.fragrancePageUrl}" style="display:inline-block;margin-left:8px;color:#cbc5be;text-decoration:none;font-size:14px;padding:12px 8px">Compare all stores</a>` : ''}
        </td></tr>
        <tr><td style="padding:20px 28px 26px">
          <p style="margin:0;font-size:12px;color:#7d766f">You're getting this because you're tracking this fragrance.
          <a href="${appUrl}/dashboard" style="color:#a39c94">Manage alerts</a>
          ${unsubscribeUrl ? `&nbsp;·&nbsp; <a href="${unsubscribeUrl}" style="color:#a39c94">Unsubscribe</a>` : ''}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  // One-click posts go to the API route; the visible link opens a confirm page
  const oneClickUrl = unsubscribeUrl?.replace('/unsubscribe?', '/api/unsubscribe?');
  return { to: params.toEmail, subject, html, unsubscribeUrl: oneClickUrl };
}

export async function sendPriceAlert(params: PriceAlertParams): Promise<void> {
  await sendEmail(renderPriceAlert(params));
}
