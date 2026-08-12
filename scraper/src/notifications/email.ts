/**
 * Email notifications via Resend (https://resend.com).
 * Set RESEND_API_KEY in .env. Free tier: 3,000 emails/month.
 */

interface PriceAlertParams {
  toEmail: string;
  fragranceName: string;
  brand: string;
  retailerName: string;
  price: number;
  currency: string;
  productUrl: string;
  threshold: number | null;
  previousBest: number | null;
}

export async function sendPriceAlert(params: PriceAlertParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not set');

  const fromEmail = process.env.EMAIL_FROM ?? 'alerts@yourdomain.com';
  const formattedPrice = `${params.currency} $${params.price.toFixed(2)}`;
  const subject = `New best deal: ${params.brand} ${params.fragranceName} just hit ${formattedPrice}`;

  const html = `
    <h2>New Best Deal</h2>
    <p><strong>${params.brand} ${params.fragranceName}</strong> just dropped to its lowest price yet —
    <strong>${formattedPrice}</strong> on ${params.retailerName}.</p>
    ${params.previousBest ? `<p>Previously as low as $${params.previousBest.toFixed(2)}.</p>` : ''}
    ${params.threshold ? `<p>This is below your alert threshold of $${params.threshold.toFixed(2)}.</p>` : ''}
    <p><a href="${params.productUrl}" style="
      background:#1a1a2e;color:#fff;padding:10px 20px;
      border-radius:4px;text-decoration:none;display:inline-block;margin-top:8px
    ">View Deal</a></p>
    <hr/>
    <p style="font-size:12px;color:#888">
      You're receiving this because you have a price alert set up.
      <a href="${process.env.APP_URL ?? '#'}/settings/notifications">Manage alerts</a>
    </p>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [params.toEmail],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API error ${response.status}: ${body}`);
  }
}
