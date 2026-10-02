import { ImageResponse } from 'next/og';

// Preview image shown when a Scentsibility link is shared (iMessage, X, Slack...)
export const runtime = 'edge';
export const alt = 'Scentsibility: compare fragrance prices';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: 'radial-gradient(ellipse at 50% 0%, #3a332b 0%, #0e0d0c 70%)',
          color: '#f2f0ed',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 700, color: '#e4c47f' }}>Scentsibility</div>
        <div style={{ fontSize: 76, fontWeight: 700, marginTop: 24, lineHeight: 1.1 }}>
          Never overpay for your favourite fragrance
        </div>
        <div style={{ fontSize: 32, color: '#a39c94', marginTop: 32 }}>
          Prices from 10 retailers, updated every 12 hours. Alerts when they drop.
        </div>
      </div>
    ),
    size
  );
}
