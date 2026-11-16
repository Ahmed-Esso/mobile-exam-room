'use client';

import { useId, type ReactNode } from 'react';

/**
 * Cute flat cartoon animal portraits, one consistent style:
 * soft tinted disc, chunky shapes, glossy eyes, blush cheeks.
 * Every portrait is drawn on a 100×100 canvas.
 */

const INK = '#1d1b22';

function Eye({ cx, cy, r = 4.5 }: { cx: number; cy: number; r?: number }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={r} ry={r * 1.12} fill={INK} />
      <circle cx={cx - r * 0.32} cy={cy - r * 0.4} r={r * 0.4} fill="#fff" />
      <circle cx={cx + r * 0.38} cy={cy + r * 0.38} r={r * 0.16} fill="#fff" opacity={0.8} />
    </g>
  );
}

function Cheeks({ y, dx = 17, color = '#ff8fb3', cx = 50 }: { y: number; dx?: number; color?: string; cx?: number }) {
  return (
    <g opacity={0.55}>
      <ellipse cx={cx - dx} cy={y} rx={5.2} ry={3.4} fill={color} />
      <ellipse cx={cx + dx} cy={y} rx={5.2} ry={3.4} fill={color} />
    </g>
  );
}

function Smile({ y, w = 5, cx = 50 }: { y: number; w?: number; cx?: number }) {
  return (
    <path
      d={`M${cx - w} ${y} Q ${cx - w / 2} ${y + 3.6} ${cx} ${y} Q ${cx + w / 2} ${y + 3.6} ${cx + w} ${y}`}
      fill="none"
      stroke={INK}
      strokeWidth={2}
      strokeLinecap="round"
    />
  );
}

interface Portrait {
  bg: string;
  label: string;
  art: ReactNode;
}

const PORTRAITS: Record<string, Portrait> = {
  /* 🐥 Chick — الكتكوت */
  '🐥': {
    bg: '#fff1bf',
    label: 'Chick',
    art: (
      <g>
        <path d="M44 27 C 41 18, 49 15, 50 23 C 52 14, 60 17, 55 27 Z" fill="#ffc21a" />
        <ellipse cx="50" cy="60" rx="31" ry="29" fill="#ffd43b" />
        <ellipse cx="50" cy="66" rx="20" ry="16" fill="#ffe27a" />
        <path d="M20 62 C 14 58, 15 70, 23 70 Z" fill="#f5b800" />
        <path d="M80 62 C 86 58, 85 70, 77 70 Z" fill="#f5b800" />
        <Eye cx={40} cy={54} />
        <Eye cx={60} cy={54} />
        <path d="M44 61 L 50 57.5 L 56 61 L 50 66 Z" fill="#ff8a1f" />
        <path d="M44 61 L 56 61" stroke="#e06a00" strokeWidth={1.2} />
        <Cheeks y={63} dx={19} />
      </g>
    ),
  },

  /* 🦋 Butterfly — الفراشة */
  '🦋': {
    bg: '#ffe2f1',
    label: 'Butterfly',
    art: (
      <g>
        <path d="M45 27 C 41 18, 35 15, 31 17" fill="none" stroke="#4a3560" strokeWidth={2.2} strokeLinecap="round" />
        <path d="M55 27 C 59 18, 65 15, 69 17" fill="none" stroke="#4a3560" strokeWidth={2.2} strokeLinecap="round" />
        <circle cx="31" cy="17" r="3" fill="#ff7ac6" />
        <circle cx="69" cy="17" r="3" fill="#ff7ac6" />
        <ellipse cx="29" cy="47" rx="20" ry="16" fill="#ff8fcf" transform="rotate(-24 29 47)" />
        <ellipse cx="71" cy="47" rx="20" ry="16" fill="#ff8fcf" transform="rotate(24 71 47)" />
        <ellipse cx="33" cy="71" rx="14" ry="12" fill="#a99bff" transform="rotate(20 33 71)" />
        <ellipse cx="67" cy="71" rx="14" ry="12" fill="#a99bff" transform="rotate(-20 67 71)" />
        <circle cx="25" cy="45" r="5" fill="#fff" opacity={0.75} />
        <circle cx="75" cy="45" r="5" fill="#fff" opacity={0.75} />
        <circle cx="31" cy="73" r="3.4" fill="#fff" opacity={0.7} />
        <circle cx="69" cy="73" r="3.4" fill="#fff" opacity={0.7} />
        <ellipse cx="50" cy="62" rx="6.5" ry="20" fill="#4a3560" />
        <circle cx="50" cy="36" r="12" fill="#5b4276" />
        <circle cx="45.5" cy="35.5" r="3.4" fill="#fff" />
        <circle cx="54.5" cy="35.5" r="3.4" fill="#fff" />
        <circle cx="46" cy="36.2" r="1.9" fill={INK} />
        <circle cx="55" cy="36.2" r="1.9" fill={INK} />
        <path d="M46.5 41 Q 50 44 53.5 41" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
        <Cheeks y={40} dx={8.5} color="#ff8fcf" />
      </g>
    ),
  },

  /* 🐬 Dolphin — الدولفين */
  '🐬': {
    bg: '#d6efff',
    label: 'Dolphin',
    art: (
      <g>
        <path d="M30 22 C 30 18, 34 16, 34 20 C 34 23, 30 24, 30 22 Z" fill="#8fd0ff" />
        <path d="M38 15 C 38 11, 42 10, 42 14 C 42 17, 38 18, 38 15 Z" fill="#8fd0ff" />
        <path d="M45 34 C 48 22, 56 18, 60 20 C 57 25, 56 30, 57 35 Z" fill="#3f8fd2" />
        <ellipse cx="50" cy="58" rx="31" ry="27" fill="#5aa9e6" />
        <ellipse cx="50" cy="68" rx="20" ry="15" fill="#d4ecff" />
        <ellipse cx="50" cy="69" rx="11" ry="6.5" fill="#e9f6ff" />
        <path d="M44 70 Q 50 75 56 70" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
        <Eye cx={38} cy={54} />
        <Eye cx={62} cy={54} />
        <Cheeks y={63} dx={20} />
        <circle cx="50" cy="38" r="2" fill="#2f78b8" />
      </g>
    ),
  },

  /* 🦉 Owl — البومة */
  '🦉': {
    bg: '#f1e4d2',
    label: 'Owl',
    art: (
      <g>
        <path d="M24 38 L 22 18 L 38 30 Z" fill="#7a5034" />
        <path d="M76 38 L 78 18 L 62 30 Z" fill="#7a5034" />
        <ellipse cx="50" cy="58" rx="31" ry="31" fill="#8b5e3c" />
        <ellipse cx="50" cy="75" rx="17" ry="12" fill="#e9cfa8" />
        <path d="M43 72 l 3 3 l 3 -3 M51 72 l 3 3 l 3 -3 M47 78 l 3 3 l 3 -3" fill="none" stroke="#b98c5e" strokeWidth={1.4} strokeLinecap="round" />
        <circle cx="38" cy="52" r="13" fill="#f6e3c6" />
        <circle cx="62" cy="52" r="13" fill="#f6e3c6" />
        <Eye cx={38} cy={52} r={6.2} />
        <Eye cx={62} cy={52} r={6.2} />
        <path d="M46 59 L 54 59 L 50 66 Z" fill="#ff9f1c" />
      </g>
    ),
  },

  /* 🐐 Goat — المعزة */
  '🐐': {
    bg: '#eaf2dc',
    label: 'Goat',
    art: (
      <g>
        <path d="M36 34 C 30 22, 34 13, 42 12 C 38 18, 38 25, 43 32 Z" fill="#c9a36b" />
        <path d="M64 34 C 70 22, 66 13, 58 12 C 62 18, 62 25, 57 32 Z" fill="#c9a36b" />
        <ellipse cx="22" cy="50" rx="11" ry="5.5" fill="#e3d7c3" transform="rotate(18 22 50)" />
        <ellipse cx="78" cy="50" rx="11" ry="5.5" fill="#e3d7c3" transform="rotate(-18 78 50)" />
        <ellipse cx="22" cy="50" rx="6" ry="2.6" fill="#f2c9c0" transform="rotate(18 22 50)" />
        <ellipse cx="78" cy="50" rx="6" ry="2.6" fill="#f2c9c0" transform="rotate(-18 78 50)" />
        <path d="M46 84 L 50 94 L 54 84 Z" fill="#e3d7c3" />
        <ellipse cx="50" cy="57" rx="24" ry="28" fill="#f7f3ea" />
        <path d="M40 32 Q 50 38 60 32 Q 56 42 50 42 Q 44 42 40 32 Z" fill="#e3d7c3" />
        <ellipse cx="50" cy="71" rx="12" ry="9" fill="#f4cfc6" />
        <ellipse cx="46" cy="69.5" rx="1.6" ry="2.2" fill="#b07a70" />
        <ellipse cx="54" cy="69.5" rx="1.6" ry="2.2" fill="#b07a70" />
        <path d="M46 75 Q 50 78 54 75" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
        <Eye cx={41} cy={54} r={4.2} />
        <Eye cx={59} cy={54} r={4.2} />
        <Cheeks y={62} dx={15} />
      </g>
    ),
  },

  /* 🦊 Fox */
  '🦊': {
    bg: '#ffe4d1',
    label: 'Fox',
    art: (
      <g>
        <path d="M22 48 L 25 16 L 45 34 Z" fill="#ff8a3d" />
        <path d="M78 48 L 75 16 L 55 34 Z" fill="#ff8a3d" />
        <path d="M27 38 L 28 24 L 39 33 Z" fill="#3a2a2a" />
        <path d="M73 38 L 72 24 L 61 33 Z" fill="#3a2a2a" />
        <path d="M50 84 C 30 82, 17 66, 19 50 C 21 38, 31 33, 50 33 C 69 33, 79 38, 81 50 C 83 66, 70 82, 50 84 Z" fill="#ff8a3d" />
        <path d="M50 84 C 39 82, 28 74, 27 62 C 36 65, 43 67, 50 67 C 57 67, 64 65, 73 62 C 72 74, 61 82, 50 84 Z" fill="#fff6ee" />
        <ellipse cx="50" cy="68" rx="4.4" ry="3.3" fill={INK} />
        <path d="M46 74 Q 50 77 54 74" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
        <Eye cx={39} cy={54} />
        <Eye cx={61} cy={54} />
        <Cheeks y={64} dx={20} />
      </g>
    ),
  },

  /* 🐼 Panda */
  '🐼': {
    bg: '#e4f3e1',
    label: 'Panda',
    art: (
      <g>
        <circle cx="27" cy="32" r="10" fill="#2b2a33" />
        <circle cx="73" cy="32" r="10" fill="#2b2a33" />
        <circle cx="50" cy="57" r="30" fill="#fbfbfb" />
        <ellipse cx="38" cy="55" rx="8.5" ry="10.5" fill="#2b2a33" transform="rotate(-28 38 55)" />
        <ellipse cx="62" cy="55" rx="8.5" ry="10.5" fill="#2b2a33" transform="rotate(28 62 55)" />
        <circle cx="39" cy="55" r="3.6" fill="#fff" />
        <circle cx="61" cy="55" r="3.6" fill="#fff" />
        <circle cx="39.6" cy="55.6" r="2.1" fill={INK} />
        <circle cx="60.4" cy="55.6" r="2.1" fill={INK} />
        <ellipse cx="50" cy="66" rx="4.5" ry="3.2" fill="#2b2a33" />
        <path d="M45.5 71 Q 50 74.5 54.5 71" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
        <Cheeks y={67} dx={20} />
      </g>
    ),
  },

  /* 🦁 Lion */
  '🦁': {
    bg: '#fff0d2',
    label: 'Lion',
    art: (
      <g>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (Math.PI * 2 * i) / 12;
          return <circle key={i} cx={50 + Math.cos(a) * 29} cy={56 + Math.sin(a) * 29} r={10} fill="#e0822a" />;
        })}
        <circle cx="50" cy="56" r="30" fill="#e8912f" />
        <circle cx="33" cy="36" r="6.5" fill="#ffc65c" />
        <circle cx="67" cy="36" r="6.5" fill="#ffc65c" />
        <circle cx="50" cy="57" r="22" fill="#ffc65c" />
        <ellipse cx="50" cy="66" rx="11" ry="8" fill="#fff1d0" />
        <path d="M46.5 62 L 53.5 62 L 50 66 Z" fill="#7a3f1d" />
        <path d="M45.5 69.5 Q 50 73 54.5 69.5" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
        <Eye cx={42} cy={53} r={4} />
        <Eye cx={58} cy={53} r={4} />
        <Cheeks y={62} dx={15} />
      </g>
    ),
  },

  /* 🐸 Frog */
  '🐸': {
    bg: '#e0f6d6',
    label: 'Frog',
    art: (
      <g>
        <circle cx="33" cy="40" r="12" fill="#6cc551" />
        <circle cx="67" cy="40" r="12" fill="#6cc551" />
        <ellipse cx="50" cy="61" rx="33" ry="24" fill="#6cc551" />
        <ellipse cx="50" cy="70" rx="21" ry="11" fill="#a6e38f" />
        <circle cx="33" cy="40" r="8.5" fill="#fff" />
        <circle cx="67" cy="40" r="8.5" fill="#fff" />
        <Eye cx={34} cy={41} r={4.6} />
        <Eye cx={66} cy={41} r={4.6} />
        <path d="M34 63 Q 50 74 66 63" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
        <circle cx="46" cy="54" r="1.3" fill="#3f8a2e" />
        <circle cx="54" cy="54" r="1.3" fill="#3f8a2e" />
        <Cheeks y={62} dx={24} />
      </g>
    ),
  },

  /* 🐱 Cat */
  '🐱': {
    bg: '#ebe5ff',
    label: 'Cat',
    art: (
      <g>
        <path d="M24 46 L 26 18 L 46 34 Z" fill="#f4a259" />
        <path d="M76 46 L 74 18 L 54 34 Z" fill="#f4a259" />
        <path d="M29 38 L 30 26 L 40 33 Z" fill="#ffc2c9" />
        <path d="M71 38 L 70 26 L 60 33 Z" fill="#ffc2c9" />
        <ellipse cx="50" cy="58" rx="29" ry="26" fill="#f4a259" />
        <path d="M44 34 l 1 7 M50 33 l 0 8 M56 34 l -1 7" stroke="#d07a32" strokeWidth={2.2} strokeLinecap="round" />
        <ellipse cx="50" cy="69" rx="14" ry="10" fill="#fff4ea" />
        <path d="M47.5 64 L 52.5 64 L 50 67 Z" fill="#ff7a93" />
        <path d="M45 70 Q 47.5 72.5 50 70 Q 52.5 72.5 55 70" fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
        <path d="M26 64 L 38 66 M26 70 L 38 69 M74 64 L 62 66 M74 70 L 62 69" stroke="#b9875a" strokeWidth={1.2} strokeLinecap="round" />
        <Eye cx={39} cy={55} />
        <Eye cx={61} cy={55} />
      </g>
    ),
  },

  /* 🐨 Koala */
  '🐨': {
    bg: '#e3ecf5',
    label: 'Koala',
    art: (
      <g>
        <circle cx="23" cy="42" r="15" fill="#a3abb8" />
        <circle cx="77" cy="42" r="15" fill="#a3abb8" />
        <circle cx="23" cy="42" r="8.5" fill="#efdce0" />
        <circle cx="77" cy="42" r="8.5" fill="#efdce0" />
        <circle cx="50" cy="58" r="27" fill="#b8c0cc" />
        <ellipse cx="50" cy="63" rx="7.5" ry="10" fill="#3a3a46" />
        <ellipse cx="48" cy="59" rx="2" ry="3" fill="#fff" opacity={0.35} />
        <path d="M45.5 75 Q 50 78 54.5 75" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
        <Eye cx={38} cy={53} r={3.8} />
        <Eye cx={62} cy={53} r={3.8} />
        <Cheeks y={66} dx={20} />
      </g>
    ),
  },

  /* 🦄 Unicorn */
  '🦄': {
    bg: '#f4e4ff',
    label: 'Unicorn',
    art: (
      <g>
        <path d="M50 10 L 44 36 L 56 36 Z" fill="#ffcf4a" />
        <path d="M46.5 27 L 53.5 24 M45.5 32 L 54.5 29" stroke="#e8a91a" strokeWidth={1.6} strokeLinecap="round" />
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
        <Eye cx={41} cy={56} r={4.2} />
        <Eye cx={59} cy={56} r={4.2} />
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

export default function AnimalAvatarArt({
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
  const clipId = useId().replace(/:/g, '');
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
        <clipPath id={clipId}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <circle cx="50" cy="50" r="50" fill={portrait.bg} />
        <ellipse cx="50" cy="96" rx="40" ry="10" fill="#000" opacity={0.06} />
        {portrait.art}
      </g>
    </svg>
  );
}
