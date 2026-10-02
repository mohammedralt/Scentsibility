/**
 * Sends email from the web app (password resets). Same providers as the
 * scraper's price alerts: Gmail when GMAIL_USER and GMAIL_APP_PASSWORD are set,
 * otherwise Resend when RESEND_API_KEY is set.
 */
import nodemailer from 'nodemailer';
import { SITE_NAME } from './site';

let gmail: nodemailer.Transporter | null = null;

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<void> {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPassword = process.env.GMAIL_APP_PASSWORD;

  if (gmailUser && gmailPassword) {
    gmail ??= nodemailer.createTransport({
      service: 'gmail',
      // App passwords are shown with spaces ("abcd efgh ijkl mnop"); Gmail wants them without
      auth: { user: gmailUser.trim(), pass: gmailPassword.replace(/\s+/g, '') },
    });
    await gmail.sendMail({ from: `${SITE_NAME} <${gmailUser.trim()}>`, to, subject, html });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('No email provider configured (set GMAIL_USER + GMAIL_APP_PASSWORD, or RESEND_API_KEY)');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? 'onboarding@resend.dev', to: [to], subject, html }),
  });
  if (!response.ok) {
    throw new Error(`Resend API error ${response.status}: ${await response.text()}`);
  }
}
