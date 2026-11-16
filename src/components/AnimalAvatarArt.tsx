'use client';

import { memo, useId, type ReactNode } from 'react';

/**
 * Rich, kawaii cartoon illustrated animal portraits on a 100x100 canvas.
 * Uses instance-scoped gradient & clip IDs via useId() so gradients never collide.
 */

const INK = '#1d1b22';

function Eye({
  cx,
  cy,
  r = 4.6,
  sparkle = false,
}: {
  cx: number;
  cy: number;
  r?: number;
  sparkle?: boolean;
}) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={r} ry={r * 1.12} fill={INK} />
      <circle cx={cx - r * 0.34} cy={cy - r * 0.42} r={r * 0.42} fill="#fff" />
      <circle cx={cx + r * 0.36} cy={cy + r * 0.34} r={r * 0.18} fill="#fff" opacity={0.85} />
      {sparkle ? (
        <circle cx={cx + r * 0.25} cy={cy - r * 0.52} r={r * 0.14} fill="#fff" opacity={0.9} />
      ) : null}
    </g>
  );
}

function Cheeks({
  y,
  dx = 17,
  color = '#ff85ad',
  cx = 50,
}: {
  y: number;
  dx?: number;
  color?: string;
  cx?: number;
}) {
  return (
    <g opacity={0.6}>
      <ellipse cx={cx - dx} cy={y} rx={5.4} ry={3.4} fill={color} />
      <ellipse cx={cx + dx} cy={y} rx={5.4} ry={3.4} fill={color} />
    </g>
  );
}

interface PortraitConfig {
  bgTop: string;
  bgBottom: string;
  label: string;
  renderDefs?: (uid: string) => ReactNode;
  renderArt: (uid: string) => ReactNode;
}

const PORTRAITS: Record<string, PortraitConfig> = {
  /* 🐥 Chick — الكتكوت */
  '🐥': {
    bgTop: '#fff7d1',
    bgBottom: '#ffe694',
    label: 'Chick',
    renderDefs: (uid) => (
      <>
        <radialGradient id={`${uid}-chick-body`} cx="45%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffea70" />
          <stop offset="68%" stopColor="#ffd133" />
          <stop offset="100%" stopColor="#f5ae14" />
        </radialGradient>
        <linearGradient id={`${uid}-chick-beak`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffa336" />
          <stop offset="100%" stopColor="#ee6b0e" />
        </linearGradient>
      </>
    ),
    renderArt: (uid) => (
      <g>
        {/* Fluffy 2-feather tuft */}
        <path
          d="M44 28 C 40 16, 49 12, 51 22 C 53 12, 62 15, 56 28 Z"
          fill="#ffbe1a"
        />
        {/* Cozy little wings */}
        <path d="M21 59 C 12 55, 13 71, 24 72 Z" fill="#f3b012" />
        <path d="M79 59 C 88 55, 87 71, 76 72 Z" fill="#f3b012" />
        {/* Body + highlight */}
        <ellipse cx="50" cy="60" rx="31" ry="29" fill={`url(#${uid}-chick-body)`} />
        <ellipse cx="42" cy="40" rx="14" ry="7" fill="#fff" opacity={0.28} transform="rotate(-14 42 40)" />
        <ellipse cx="50" cy="68" rx="19" ry="15" fill="#fff1a6" opacity={0.85} />
        <Eye cx={39.5} cy={54} r={4.7} sparkle />
        <Eye cx={60.5} cy={54} r={4.7} sparkle />
        {/* Sweet diamond beak */}
        <path d="M43.5 61.5 L 50 57.5 L 56.5 61.5 L 50 66.5 Z" fill={`url(#${uid}-chick-beak)`} />
        <path d="M44 61.5 L 56 61.5" stroke="#cc5800" strokeWidth={1.1} />
        <Cheeks y={63} dx={19} />
      </g>
    ),
  },

  /* 🦋 Butterfly — الفراشة */
  '🦋': {
    bgTop: '#ffebf6',
    bgBottom: '#f9d4ec',
    label: 'Butterfly',
    renderDefs: (uid) => (
      <>
        <linearGradient id={`${uid}-bf-top`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff9de0" />
          <stop offset="55%" stopColor="#ff73be" />
          <stop offset="100%" stopColor="#d96bff" />
        </linearGradient>
        <linearGradient id={`${uid}-bf-bot`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c4b5ff" />
          <stop offset="100%" stopColor="#8574ff" />
        </linearGradient>
      </>
    ),
    renderArt: (uid) => (
      <g>
        <path d="M45 27 C 41 18, 35 15, 31 17" fill="none" stroke="#4a3560" strokeWidth={2.2} strokeLinecap="round" />
        <path d="M55 27 C 59 18, 65 15, 69 17" fill="none" stroke="#4a3560" strokeWidth={2.2} strokeLinecap="round" />
        <circle cx="31" cy="17" r="3.2" fill="#ff7ac6" />
        <circle cx="69" cy="17" r="3.2" fill="#ff7ac6" />
        {/* Iridescent wings */}
        <ellipse cx="29" cy="47" rx="20" ry="16" fill={`url(#${uid}-bf-top)`} transform="rotate(-24 29 47)" />
        <ellipse cx="71" cy="47" rx="20" ry="16" fill={`url(#${uid}-bf-top)`} transform="rotate(24 71 47)" />
        <ellipse cx="33" cy="71" rx="14" ry="12" fill={`url(#${uid}-bf-bot)`} transform="rotate(20 33 71)" />
        <ellipse cx="67" cy="71" rx="14" ry="12" fill={`url(#${uid}-bf-bot)`} transform="rotate(-20 67 71)" />
        {/* Wing shimmer spots */}
        <circle cx="24.5" cy="44.5" r="5" fill="#fff" opacity={0.78} />
        <circle cx="75.5" cy="44.5" r="5" fill="#fff" opacity={0.78} />
        <circle cx="31" cy="51" r="2.2" fill="#fff" opacity={0.6} />
        <circle cx="69" cy="51" r="2.2" fill="#fff" opacity={0.6} />
        <circle cx="31" cy="73" r="3.6" fill="#fff" opacity={0.72} />
        <circle cx="69" cy="73" r="3.6" fill="#fff" opacity={0.72} />
        {/* Body + head */}
        <ellipse cx="50" cy="62" rx="6.6" ry="20" fill="#47315d" />
        <circle cx="50" cy="36" r="12.2" fill="#5b4276" />
        <ellipse cx="46" cy="29" rx="6" ry="3" fill="#fff" opacity={0.16} />
        <circle cx="45.5" cy="35.5" r="3.5" fill="#fff" />
        <circle cx="54.5" cy="35.5" r="3.5" fill="#fff" />
        <circle cx="46" cy="36.2" r="2" fill={INK} />
        <circle cx="55" cy="36.2" r="2" fill={INK} />
        <circle cx="45.3" cy="35.1" r="0.8" fill="#fff" />
        <circle cx="54.3" cy="35.1" r="0.8" fill="#fff" />
        <path d="M46.5 41.2 Q 50 44.2 53.5 41.2" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
        <Cheeks y={40.2} dx={8.8} color="#ff8fcf" />
      </g>
    ),
  },

  /* 🐬 Dolphin — الدولفين */
  '🐬': {
    bgTop: '#e3f4ff',
    bgBottom: '#bfe5ff',
    label: 'Dolphin',
    renderDefs: (uid) => (
      <radialGradient id={`${uid}-dolphin`} cx="42%" cy="32%" r="68%">
        <stop offset="0%" stopColor="#85cbff" />
        <stop offset="65%" stopColor="#4da3e8" />
        <stop offset="100%" stopColor="#2e7fc7" />
      </radialGradient>
    ),
    renderArt: (uid) => (
      <g>
        {/* Water splash droplets */}
        <path d="M29 22 C 29 17, 34 15, 34 20 C 34 23.5, 29 24.5, 29 22 Z" fill="#6cc4ff" />
        <path d="M38 15 C 38 10.5, 42.5 9.5, 42.5 14 C 42.5 17, 38 18, 38 15 Z" fill="#6cc4ff" />
        <circle cx="69" cy="21" r="2.2" fill="#8fd6ff" />
        {/* Dorsal fin */}
        <path d="M45 34 C 48 21, 56 17, 61 19 C 57 25, 56 30, 57 35 Z" fill="#2e7fc7" />
        {/* Body + glossy forehead shine */}
        <ellipse cx="50" cy="58" rx="31" ry="27" fill={`url(#${uid}-dolphin)`} />
        <ellipse cx="42" cy="40" rx="13" ry="6.5" fill="#fff" opacity={0.28} transform="rotate(-14 42 40)" />
        {/* Belly & snout */}
        <ellipse cx="50" cy="68" rx="20" ry="15" fill="#ddf0ff" />
        <ellipse cx="50" cy="69" rx="11.5" ry="6.8" fill="#f3faff" />
        <path d="M44 70 Q 50 75 56 70" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
        <Eye cx={38} cy={54} sparkle />
        <Eye cx={62} cy={54} sparkle />
        <Cheeks y={63} dx={20} />
        <circle cx="50" cy="38" r="1.9" fill="#24659e" />
      </g>
    ),
  },

  /* 🦉 Owl — البومة */
  '🦉': {
    bgTop: '#f7eee0',
    bgBottom: '#ebd4b4',
    label: 'Owl',
    renderDefs: (uid) => (
      <>
        <radialGradient id={`${uid}-owl-body`} cx="46%" cy="32%" r="68%">
          <stop offset="0%" stopColor="#bd8556" />
          <stop offset="68%" stopColor="#94603a" />
          <stop offset="100%" stopColor="#724627" />
        </radialGradient>
        <linearGradient id={`${uid}-owl-beak`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffbe4d" />
          <stop offset="100%" stopColor="#f08c18" />
        </linearGradient>
      </>
    ),
    renderArt: (uid) => (
      <g>
        {/* Soft rounded ear-feather tufts */}
        <path
          d="M27 42 C 22 30, 26 20, 35 23 C 40 25, 42 30, 42 35 Z"
          fill="#855331"
        />
        <path
          d="M73 42 C 78 30, 74 20, 65 23 C 60 25, 58 30, 58 35 Z"
          fill="#855331"
        />
        <path d="M29 36 C 27 29, 30 24, 35 26" fill="none" stroke="#e8c89c" strokeWidth={2.2} strokeLinecap="round" opacity={0.75} />
        <path d="M71 36 C 73 29, 70 24, 65 26" fill="none" stroke="#e8c89c" strokeWidth={2.2} strokeLinecap="round" opacity={0.75} />
        {/* Cute tucked side wings */}
        <ellipse cx="22" cy="66" rx="9" ry="16" fill="#77492a" transform="rotate(14 22 66)" />
        <ellipse cx="78" cy="66" rx="9" ry="16" fill="#77492a" transform="rotate(-14 78 66)" />
        {/* Plump pear-shaped baby owl body */}
        <path
          d="M50 26 C 69 26, 78 40, 79 59 C 80 79, 67 89, 50 89 C 33 89, 20 79, 21 59 C 22 40, 31 26, 50 26 Z"
          fill={`url(#${uid}-owl-body)`}
        />
        {/* Soft scalloped cream tummy + curved breast feathers */}
        <ellipse cx="50" cy="76" rx="18" ry="12" fill="#f7e8ce" />
        <path
          d="M41 72 Q 44 76 47 72 M47 72 Q 50 76 53 72 M53 72 Q 56 76 59 72 M44 78 Q 47 81.5 50 78 M50 78 Q 53 81.5 56 78"
          fill="none"
          stroke="#c89d6c"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        {/* Warm heart-shaped cream spectacle facial mask */}
        <path
          d="M50 38 C 44 31, 27 32, 26 48 C 25 60, 38 66, 50 64 C 62 66, 75 60, 74 48 C 73 32, 56 31, 50 38 Z"
          fill="#fbf1de"
        />
        {/* Soft golden eye rims */}
        <circle cx="38.5" cy="49" r="10.2" fill="none" stroke="#e9c792" strokeWidth={1.8} />
        <circle cx="61.5" cy="49" r="10.2" fill="none" stroke="#e9c792" strokeWidth={1.8} />
        {/* Large expressive kawaii eyes */}
        <Eye cx={38.5} cy={49} r={5.7} sparkle />
        <Eye cx={61.5} cy={49} r={5.7} sparkle />
        {/* Rosy cheeks gently below eyes */}
        <Cheeks y={58} dx={16.5} />
        {/* Tiny cute rounded golden-amber beak */}
        <path
          d="M46 54.5 Q 50 51.5 54 54.5 Q 53 59.5 50 60.5 Q 47 59.5 46 54.5 Z"
          fill={`url(#${uid}-owl-beak)`}
        />
      </g>
    ),
  },

  /* 🐐 Goat — المعزة */
  '🐐': {
    bgTop: '#f1f7e5',
    bgBottom: '#dce8c5',
    label: 'Goat',
    renderDefs: (uid) => (
      <linearGradient id={`${uid}-goat-horn`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#dcb880" />
        <stop offset="100%" stopColor="#a67c46" />
      </linearGradient>
    ),
    renderArt: (uid) => (
      <g>
        {/* Curved ridged horns */}
        <path d="M36 34 C 30 22, 34 12, 42 11 C 38 18, 38 25, 43 32 Z" fill={`url(#${uid}-goat-horn)`} />
        <path d="M64 34 C 70 22, 66 12, 58 11 C 62 18, 62 25, 57 32 Z" fill={`url(#${uid}-goat-horn)`} />
        <path d="M34 22 L 38 20 M35 27 L 39 25 M66 22 L 62 20 M65 27 L 61 25" stroke="#8c6434" strokeWidth={1.1} strokeLinecap="round" />
        {/* Floppy ears */}
        <ellipse cx="22" cy="50" rx="11" ry="5.5" fill="#e6dac6" transform="rotate(18 22 50)" />
        <ellipse cx="78" cy="50" rx="11" ry="5.5" fill="#e6dac6" transform="rotate(-18 78 50)" />
        <ellipse cx="22" cy="50" rx="6" ry="2.6" fill="#f5c6bc" transform="rotate(18 22 50)" />
        <ellipse cx="78" cy="50" rx="6" ry="2.6" fill="#f5c6bc" transform="rotate(-18 78 50)" />
        {/* Chin beard */}
        <path d="M46 82 L 50 93 L 54 82 Z" fill="#e3d7c3" />
        {/* Face */}
        <ellipse cx="50" cy="56" rx="24" ry="27" fill="#faf7f0" />
        <path d="M40 31 Q 50 37 60 31 Q 56 41 50 41 Q 44 41 40 31 Z" fill="#e8dcc8" />
        {/* Cute golden collar & bell */}
        <path d="M36 81 Q 50 86 64 81" fill="none" stroke="#ff6a55" strokeWidth={3.2} strokeLinecap="round" />
        <circle cx="50" cy="86" r="4" fill="#ffcf40" stroke="#c89200" strokeWidth={0.9} />
        {/* Snout */}
        <ellipse cx="50" cy="69" rx="12" ry="8.5" fill="#f6d2c9" />
        <ellipse cx="46" cy="67.5" rx="1.6" ry="2.2" fill="#b07a70" />
        <ellipse cx="54" cy="67.5" rx="1.6" ry="2.2" fill="#b07a70" />
        <path d="M46 73 Q 50 76 54 73" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
        <Eye cx={41} cy={53} r={4.3} sparkle />
        <Eye cx={59} cy={53} r={4.3} sparkle />
        <Cheeks y={60} dx={15} />
      </g>
    ),
  },

  /* 🦊 Fox */
  '🦊': {
    bgTop: '#ffeadb',
    bgBottom: '#ffd3b6',
    label: 'Fox',
    renderDefs: (uid) => (
      <radialGradient id={`${uid}-fox`} cx="45%" cy="32%" r="68%">
        <stop offset="0%" stopColor="#ffa357" />
        <stop offset="72%" stopColor="#ff7c29" />
        <stop offset="100%" stopColor="#e55a10" />
      </radialGradient>
    ),
    renderArt: (uid) => (
      <g>
        <path d="M22 48 L 25 16 L 45 34 Z" fill="#ff7c29" />
        <path d="M78 48 L 75 16 L 55 34 Z" fill="#ff7c29" />
        <path d="M27 38 L 28 24 L 39 33 Z" fill="#3a2a2a" />
        <path d="M73 38 L 72 24 L 61 33 Z" fill="#3a2a2a" />
        <path
          d="M50 84 C 30 82, 17 66, 19 50 C 21 38, 31 33, 50 33 C 69 33, 79 38, 81 50 C 83 66, 70 82, 50 84 Z"
          fill={`url(#${uid}-fox)`}
        />
        <path
          d="M50 84 C 39 82, 28 74, 27 62 C 36 65, 43 67, 50 67 C 57 67, 64 65, 73 62 C 72 74, 61 82, 50 84 Z"
          fill="#fff7f0"
        />
        <ellipse cx="50" cy="68" rx="4.4" ry="3.3" fill={INK} />
        <path d="M46 74 Q 50 77 54 74" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
        <Eye cx={39} cy={54} sparkle />
        <Eye cx={61} cy={54} sparkle />
        <Cheeks y={64} dx={20} />
      </g>
    ),
  },

  /* 🐼 Panda */
  '🐼': {
    bgTop: '#ebf7e8',
    bgBottom: '#d0eacd',
    label: 'Panda',
    renderArt: () => (
      <g>
        <circle cx="27" cy="32" r="10" fill="#2b2a33" />
        <circle cx="73" cy="32" r="10" fill="#2b2a33" />
        <circle cx="50" cy="57" r="30" fill="#ffffff" />
        <ellipse cx="50" cy="76" rx="22" ry="9" fill="#f0f0f3" opacity={0.7} />
        <ellipse cx="38" cy="55" rx="8.5" ry="10.5" fill="#2b2a33" transform="rotate(-28 38 55)" />
        <ellipse cx="62" cy="55" rx="8.5" ry="10.5" fill="#2b2a33" transform="rotate(28 62 55)" />
        <circle cx="39" cy="55" r="3.8" fill="#fff" />
        <circle cx="61" cy="55" r="3.8" fill="#fff" />
        <circle cx="39.5" cy="55.6" r="2.1" fill={INK} />
        <circle cx="60.5" cy="55.6" r="2.1" fill={INK} />
        <circle cx="38.8" cy="54.6" r="0.8" fill="#fff" />
        <circle cx="59.8" cy="54.6" r="0.8" fill="#fff" />
        <ellipse cx="50" cy="66" rx="4.5" ry="3.2" fill="#2b2a33" />
        <path d="M45.5 71 Q 50 74.5 54.5 71" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
        <Cheeks y={67} dx={20} />
      </g>
    ),
  },

  /* 🦁 Lion */
  '🦁': {
    bgTop: '#fff4dc',
    bgBottom: '#ffe1aa',
    label: 'Lion',
    renderDefs: (uid) => (
      <radialGradient id={`${uid}-lion`} cx="45%" cy="35%" r="65%">
        <stop offset="0%" stopColor="#ffd778" />
        <stop offset="75%" stopColor="#ffb842" />
        <stop offset="100%" stopColor="#e8941e" />
      </radialGradient>
    ),
    renderArt: (uid) => (
      <g>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (Math.PI * 2 * i) / 12;
          return <circle key={i} cx={50 + Math.cos(a) * 29} cy={56 + Math.sin(a) * 29} r={10} fill="#dd7d22" />;
        })}
        <circle cx="50" cy="56" r="30" fill="#e88e28" />
        <circle cx="33" cy="36" r="6.5" fill="#ffc65c" />
        <circle cx="67" cy="36" r="6.5" fill="#ffc65c" />
        <circle cx="50" cy="57" r="22" fill={`url(#${uid}-lion)`} />
        <ellipse cx="50" cy="66" rx="11" ry="8" fill="#fff3d6" />
        <path d="M46.5 62 L 53.5 62 L 50 66 Z" fill="#7a3f1d" />
        <path d="M45.5 69.5 Q 50 73 54.5 69.5" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
        <Eye cx={42} cy={53} r={4.1} sparkle />
        <Eye cx={58} cy={53} r={4.1} sparkle />
        <Cheeks y={62} dx={15} />
      </g>
    ),
  },

  /* 🐸 Frog */
  '🐸': {
    bgTop: '#e8fae0',
    bgBottom: '#c9efb8',
    label: 'Frog',
    renderDefs: (uid) => (
      <radialGradient id={`${uid}-frog`} cx="45%" cy="35%" r="68%">
        <stop offset="0%" stopColor="#8be06c" />
        <stop offset="70%" stopColor="#62bd46" />
        <stop offset="100%" stopColor="#46992e" />
      </radialGradient>
    ),
    renderArt: (uid) => (
      <g>
        <circle cx="33" cy="40" r="12" fill="#62bd46" />
        <circle cx="67" cy="40" r="12" fill="#62bd46" />
        <ellipse cx="50" cy="61" rx="33" ry="24" fill={`url(#${uid}-frog)`} />
        <ellipse cx="50" cy="70" rx="21" ry="11" fill="#b4ec9c" />
        <circle cx="33" cy="40" r="8.5" fill="#fff" />
        <circle cx="67" cy="40" r="8.5" fill="#fff" />
        <Eye cx={34} cy={41} r={4.6} sparkle />
        <Eye cx={66} cy={41} r={4.6} sparkle />
        <path d="M34 63 Q 50 74 66 63" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
        <circle cx="46" cy="54" r="1.3" fill="#3a8029" />
        <circle cx="54" cy="54" r="1.3" fill="#3a8029" />
        <Cheeks y={62} dx={24} />
      </g>
    ),
  },

  /* 🐱 Cat */
  '🐱': {
    bgTop: '#f1ecff',
    bgBottom: '#ded4ff',
    label: 'Cat',
    renderDefs: (uid) => (
      <radialGradient id={`${uid}-cat`} cx="45%" cy="32%" r="68%">
        <stop offset="0%" stopColor="#ffbb78" />
        <stop offset="70%" stopColor="#f29a4b" />
        <stop offset="100%" stopColor="#d97b2c" />
      </radialGradient>
    ),
    renderArt: (uid) => (
      <g>
        <path d="M24 46 L 26 18 L 46 34 Z" fill="#f29a4b" />
        <path d="M76 46 L 74 18 L 54 34 Z" fill="#f29a4b" />
        <path d="M29 38 L 30 26 L 40 33 Z" fill="#ffc2c9" />
        <path d="M71 38 L 70 26 L 60 33 Z" fill="#ffc2c9" />
        <ellipse cx="50" cy="58" rx="29" ry="26" fill={`url(#${uid}-cat)`} />
        <path d="M44 34 l 1 7 M50 33 l 0 8 M56 34 l -1 7" stroke="#c87028" strokeWidth={2.2} strokeLinecap="round" />
        <ellipse cx="50" cy="69" rx="14" ry="10" fill="#fff6ee" />
        <path d="M47.5 64 L 52.5 64 L 50 67 Z" fill="#ff7a93" />
        <path d="M45 70 Q 47.5 72.5 50 70 Q 52.5 72.5 55 70" fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
        <path d="M26 64 L 38 66 M26 70 L 38 69 M74 64 L 62 66 M74 70 L 62 69" stroke="#b9875a" strokeWidth={1.2} strokeLinecap="round" />
        <Eye cx={39} cy={55} sparkle />
        <Eye cx={61} cy={55} sparkle />
        <Cheeks y={63} dx={19} />
      </g>
    ),
  },

  /* 🐨 Koala */
  '🐨': {
    bgTop: '#ebf2f9',
    bgBottom: '#d2e0ef',
    label: 'Koala',
    renderDefs: (uid) => (
      <radialGradient id={`${uid}-koala`} cx="45%" cy="32%" r="68%">
        <stop offset="0%" stopColor="#cdd5e0" />
        <stop offset="72%" stopColor="#adb6c4" />
        <stop offset="100%" stopColor="#8d97a6" />
      </radialGradient>
    ),
    renderArt: (uid) => (
      <g>
        <circle cx="23" cy="42" r="15" fill="#9ea7b5" />
        <circle cx="77" cy="42" r="15" fill="#9ea7b5" />
        <circle cx="23" cy="42" r="8.5" fill="#f2dfe3" />
        <circle cx="77" cy="42" r="8.5" fill="#f2dfe3" />
        <circle cx="50" cy="58" r="27" fill={`url(#${uid}-koala)`} />
        <ellipse cx="50" cy="63" rx="7.5" ry="10" fill="#3a3a46" />
        <ellipse cx="48" cy="59" rx="2.1" ry="3.2" fill="#fff" opacity={0.38} />
        <path d="M45.5 75 Q 50 78 54.5 75" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
        <Eye cx={38} cy={53} r={3.9} sparkle />
        <Eye cx={62} cy={53} r={3.9} sparkle />
        <Cheeks y={66} dx={20} />
      </g>
    ),
  },

  /* 🦄 Unicorn */
  '🦄': {
    bgTop: '#f8ebff',
    bgBottom: '#ecd2ff',
    label: 'Unicorn',
    renderDefs: (uid) => (
      <linearGradient id={`${uid}-horn`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#ffe57f" />
        <stop offset="100%" stopColor="#ffae2b" />
      </linearGradient>
    ),
    renderArt: (uid) => (
      <g>
        <path d="M50 10 L 44 36 L 56 36 Z" fill={`url(#${uid}-horn)`} />
        <path d="M46.5 27 L 53.5 24 M45.5 32 L 54.5 29" stroke="#d98b00" strokeWidth={1.6} strokeLinecap="round" />
        <path d="M30 40 L 30 24 L 41 34 Z" fill="#fffaf5" />
        <path d="M70 40 L 70 24 L 59 34 Z" fill="#fffaf5" />
        <ellipse cx="50" cy="59" rx="25" ry="27" fill="#fffaf5" />
        <path d="M28 52 C 22 36, 34 26, 46 32 C 38 34, 34 42, 34 52 Z" fill="#ff8fcf" />
        <path d="M33 58 C 26 46, 32 36, 42 36 C 37 42, 36 50, 38 58 Z" fill="#a99bff" />
        <path d="M72 52 C 78 40, 70 30, 60 32 C 66 36, 68 44, 66 52 Z" fill="#7fd8c9" />
        <ellipse cx="50" cy="73" rx="14" ry="10" fill="#ffd6e4" />
        <ellipse cx="45.5" cy="72" rx="1.7" ry="2.4" fill="#d98aa6" />
        <ellipse cx="54.5" cy="72" rx="1.7" ry="2.4" fill="#d98aa6" />
        <path d="M46 78 Q 50 80.5 54 78" fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
        <Eye cx={41} cy={56} r={4.2} sparkle />
        <Eye cx={59} cy={56} r={4.2} sparkle />
        <path d="M36 52 L 33 50 M64 52 L 67 50" stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
        <Cheeks y={65} dx={17} />
      </g>
    ),
  },
};

/** Legacy avatars from earlier versions map onto the closest portrait. */
const ALIASES: Record<string, string> = {
  '🐣': '🐥',
  '🐤': '🐥',
};

export function hasAnimalArt(emoji: string): boolean {
  return Boolean(PORTRAITS[emoji] || PORTRAITS[ALIASES[emoji] ?? '']);
}

export function animalLabel(emoji: string): string | undefined {
  return (PORTRAITS[emoji] ?? PORTRAITS[ALIASES[emoji] ?? ''])?.label;
}

const AnimalAvatarArt = memo(function AnimalAvatarArt({
  emoji,
  size = 44,
  className = '',
  title,
}: {
  emoji: string;
  size?: number;
  className?: string;
  title?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const portrait = PORTRAITS[emoji] ?? PORTRAITS[ALIASES[emoji] ?? ''];

  if (!portrait) {
    return (
      <span
        className={`inline-flex items-center justify-center ${className}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.56), lineHeight: 1 }}
        aria-hidden={!title}
        role={title ? 'img' : undefined}
        aria-label={title}
      >
        {emoji}
      </span>
    );
  }

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title ?? undefined}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <clipPath id={`${uid}-clip`}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
        <linearGradient id={`${uid}-bg`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={portrait.bgTop} />
          <stop offset="100%" stopColor={portrait.bgBottom} />
        </linearGradient>
        {portrait.renderDefs?.(uid)}
      </defs>
      <g clipPath={`url(#${uid}-clip)`}>
        <circle cx="50" cy="50" r="50" fill={`url(#${uid}-bg)`} />
        <ellipse cx="50" cy="96" rx="40" ry="10" fill="#000" opacity={0.07} />
        {portrait.renderArt(uid)}
      </g>
    </svg>
  );
});

export default AnimalAvatarArt;
