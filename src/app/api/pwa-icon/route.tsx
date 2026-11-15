import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

const ALLOWED_SIZES = new Set([180, 192, 512]);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0e0f13"/>
  <path d="M86 368 C 170 352, 330 350, 428 362 L 424 420 C 330 410, 176 412, 90 426 Z" fill="#d7ff3f"/>
  <ellipse cx="262" cy="300" rx="128" ry="112" fill="#ffd43b"/>
  <circle cx="232" cy="196" r="88" fill="#ffd43b"/>
  <path d="M222 112 C 214 82, 238 70, 246 92 C 252 74, 276 80, 266 110 Z" fill="#ffd43b"/>
  <path d="M300 286 C 352 270, 384 300, 368 336 C 344 354, 310 340, 300 286 Z" fill="#f5b800"/>
  <circle cx="254" cy="186" r="15" fill="#0e0f13"/>
  <circle cx="259" cy="180" r="5" fill="#ffffff"/>
  <path d="M300 204 L 348 218 L 300 234 Z" fill="#ff8a1f"/>
  <circle cx="214" cy="226" r="14" fill="#ff7ac6" fill-opacity="0.55"/>
</svg>`;

export async function GET(req: NextRequest) {
  const rawSize = Number(req.nextUrl.searchParams.get('size') || 512);
  const size = ALLOWED_SIZES.has(rawSize) ? rawSize : 512;
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#0e0f13',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={size} height={size} alt="" />
      </div>
    ),
    {
      width: size,
      height: size,
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    }
  );
}
