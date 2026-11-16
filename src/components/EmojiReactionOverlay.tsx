'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { STATUS_BADGES, type EmojiReaction, type ReactionKind } from '@/types/exam';
import AnimalAvatarArt from './AnimalAvatarArt';
import { haptic } from './ui';

/* -------------------------------------------------------------------------- */
/* Optimistic local reactions: the dock and contextual strip call this so the  */
/* sender sees their reaction instantly; the server echo is then de-duplicated.*/
/* -------------------------------------------------------------------------- */

export interface LocalReactionDetail {
  emoji: string;
  label?: string;
  kind: ReactionKind;
  targetName?: string;
  targetAvatar?: string;
  targetMemberId?: string;
}

const LOCAL_EVENT = 'exam:local-reaction';

export function emitLocalReaction(detail: LocalReactionDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<LocalReactionDetail>(LOCAL_EVENT, { detail }));
}

/* -------------------------------------------------------------------------- */

interface Bubble {
  id: string;
  emoji: string;
  tag: string;
  mine: boolean;
  left: number;
  drift: number;
  rise: number;
  dur: number;
}

interface Banner {
  id: string;
  emoji: string;
  label?: string;
  kind: ReactionKind;
  senderName: string;
  senderAvatar: string;
  targetName?: string;
  targetAvatar?: string;
  mine: boolean;
  toMe: boolean;
  leaving?: boolean;
}

interface Particle {
  id: string;
  emoji: string;
  dx: number;
  dy: number;
  rot: number;
  delay: number;
}

interface Spawnable {
  id: string;
  emoji: string;
  label?: string;
  kind: ReactionKind;
  senderName: string;
  senderAvatar: string;
  targetName?: string;
  targetAvatar?: string;
  targetMemberId?: string;
  mine: boolean;
}

let uid = 0;
const nextId = (p: string) => `${p}-${Date.now()}-${uid++}`;

export default function EmojiReactionOverlay({
  reactions,
  meId,
  meName,
  meAvatar,
}: {
  reactions: EmojiReaction[];
  meId: string | null;
  meName: string;
  meAvatar: string;
}) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  const pending = useRef<
    {
      emoji: string;
      kind: ReactionKind;
      targetName?: string;
      targetMemberId?: string;
      at: number;
    }[]
  >([]);
  const timers = useRef<number[]>([]);

  const later = useCallback((fn: () => void, ms: number) => {
    const t = window.setTimeout(fn, ms);
    timers.current.push(t);
  }, []);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((t) => window.clearTimeout(t));
  }, []);

  const spawnBubble = useCallback(
    (s: Spawnable) => {
      const id = nextId('b');
      const statusLabel = s.kind === 'status' ? STATUS_BADGES.find((b) => b.emoji === s.emoji)?.label ?? s.label : undefined;
      const who = s.mine ? 'You' : s.senderName;
      const tag = s.kind === 'status' ? `${s.senderAvatar} ${who} · ${statusLabel ?? 'status'}` : `${s.senderAvatar} ${who} sent ${s.emoji}`;
      const b: Bubble = {
        id,
        emoji: s.emoji,
        tag,
        mine: s.mine,
        left: 8 + Math.random() * 70,
        drift: (Math.random() - 0.5) * 90,
        rise: 340 + Math.random() * 220,
        dur: 3.2 + Math.random() * 1.2,
      };
      setBubbles((prev) => [...prev.slice(-26), b]);
      later(() => setBubbles((prev) => prev.filter((x) => x.id !== id)), b.dur * 1000 + 100);
    },
    [later]
  );

  const spawnBanner = useCallback(
    (s: Spawnable, toMe: boolean) => {
      const id = nextId('n');
      setBanners((prev) => [
        ...prev.slice(-2),
        {
          id,
          emoji: s.emoji,
          label: s.label,
          kind: s.kind,
          senderName: s.senderName,
          senderAvatar: s.senderAvatar,
          targetName: s.targetName,
          targetAvatar: s.targetAvatar,
          mine: s.mine,
          toMe,
        },
      ]);
      const burst: Particle[] = Array.from({ length: 9 }, (_, i) => {
        const angle = (Math.PI * 2 * i) / 9 + Math.random() * 0.5;
        const dist = 70 + Math.random() * 70;
        return {
          id: nextId('p'),
          emoji: s.emoji,
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist + 40,
          rot: (Math.random() - 0.5) * 120,
          delay: Math.random() * 120,
        };
      });
      setParticles((prev) => [...prev.slice(-18), ...burst]);
      later(() => setParticles((prev) => prev.filter((p) => !burst.some((b) => b.id === p.id))), 1900);
      later(() => setBanners((prev) => prev.map((b) => (b.id === id ? { ...b, leaving: true } : b))), 3400);
      later(() => setBanners((prev) => prev.filter((b) => b.id !== id)), 3800);
      if (toMe) haptic([12, 50, 12, 50, 20]);
    },
    [later]
  );

  const spawn = useCallback(
    (s: Spawnable) => {
      if (s.kind.startsWith('contextual')) {
        spawnBanner(s, !!meId && s.targetMemberId === meId);
      } else {
        spawnBubble(s);
      }
    },
    [spawnBanner, spawnBubble, meId]
  );

  // Optimistic local reactions
  useEffect(() => {
    const onLocal = (e: Event) => {
      const d = (e as CustomEvent<LocalReactionDetail>).detail;
      pending.current.push({
        emoji: d.emoji,
        kind: d.kind,
        targetName: d.targetName,
        targetMemberId: d.targetMemberId,
        at: Date.now(),
      });
      spawn({
        id: nextId('l'),
        emoji: d.emoji,
        label: d.label,
        kind: d.kind,
        senderName: meName,
        senderAvatar: meAvatar,
        targetName: d.targetName,
        targetAvatar: d.targetAvatar,
        targetMemberId: d.targetMemberId,
        mine: true,
      });
    };
    window.addEventListener(LOCAL_EVENT, onLocal);
    return () => window.removeEventListener(LOCAL_EVENT, onLocal);
  }, [spawn, meName, meAvatar]);

  // Server reactions
  useEffect(() => {
    const now = Date.now();
    if (!primed.current) {
      primed.current = true;
      for (const r of reactions) {
        if (now - r.createdAt > 2500) seen.current.add(r.id);
      }
    }
    pending.current = pending.current.filter((p) => now - p.at < 6000);

    for (const r of reactions) {
      if (seen.current.has(r.id)) continue;
      seen.current.add(r.id);
      const mine = !!meId && r.senderId === meId;
      if (mine) {
        const idx = pending.current.findIndex(
          (p) =>
            p.emoji === r.emoji &&
            p.kind === r.kind &&
            (!p.targetMemberId || !r.targetMemberId || p.targetMemberId === r.targetMemberId) &&
            (!p.targetName || !r.targetMemberName || p.targetName === r.targetMemberName)
        );
        if (idx >= 0) {
          pending.current.splice(idx, 1);
          continue;
        }
      }
      spawn({ ...r, mine });
    }
    if (seen.current.size > 400) {
      seen.current = new Set(reactions.map((r) => r.id));
    }
  }, [reactions, meId, spawn]);

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden" aria-live="polite">
      {/* Banners */}
      <div className="absolute inset-x-3 flex flex-col items-center gap-2" style={{ top: 'calc(max(var(--safe-top), 14px) + 128px)' }}>
        {banners.map((b) => (
          <BannerCard key={b.id} b={b} />
        ))}
        <div className="relative h-0 w-0">
          {particles.map((p) => (
            <span
              key={p.id}
              className="burst-particle"
              style={
                {
                  left: -13,
                  top: -80,
                  '--dx': `${p.dx}px`,
                  '--dy': `${p.dy}px`,
                  '--rot': `${p.rot}deg`,
                  animationDelay: `${p.delay}ms`,
                } as React.CSSProperties
              }
            >
              {p.emoji}
            </span>
          ))}
        </div>
      </div>

      {/* Floating bubbles */}
      {bubbles.map((b) => (
        <div
          key={b.id}
          className="float-bubble"
          style={
            {
              left: `${b.left}%`,
              '--drift': `${b.drift}px`,
              '--rise': `${b.rise}px`,
              '--dur': `${b.dur}s`,
            } as React.CSSProperties
          }
        >
          <span className="float-emoji">{b.emoji}</span>
          <span className="float-tag" style={b.mine ? { background: 'var(--paper)', color: 'var(--ink)' } : undefined}>
            {b.tag}
          </span>
        </div>
      ))}
    </div>
  );
}

function BannerCard({ b }: { b: Banner }) {
  const sender = b.mine ? 'You' : b.senderName;
  const target = b.toMe ? 'you' : b.targetName;

  let context: string;
  if (b.kind === 'contextual-wrong-right') {
    context = b.toMe ? 'on your right answer!' : target ? `on ${target}'s right answer` : 'on a right answer';
  } else if (b.kind === 'contextual-both-right') {
    context = target ? `both got it: ${b.mine ? 'you' : b.senderName} & ${target}` : 'both got it right';
  } else {
    context = target ? `to ${target}` : 'to the room';
  }

  return (
    <div
      className={`${b.leaving ? 'banner-out' : 'banner-in'} glass flex w-full max-w-[360px] items-center gap-3 rounded-[22px] px-3 py-2.5`}
      style={{
        boxShadow: b.toMe
          ? '0 0 0 2px var(--lime), 0 18px 40px -16px rgba(0,0,0,0.8)'
          : '0 0 0 1px var(--line-strong), 0 18px 40px -16px rgba(0,0,0,0.8)',
      }}
    >
      <span
        className="pop flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[28px]"
        style={{ background: b.toMe ? 'var(--lime)' : 'var(--surface-3)' }}
      >
        {b.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[12px] font-semibold text-[var(--muted)]">
          <AnimalAvatarArt emoji={b.senderAvatar} size={16} />
          <span className="truncate text-[var(--paper)]">{sender}</span>
          {b.targetAvatar || target ? (
            <>
              <span aria-hidden>→</span>
              {b.targetAvatar ? <AnimalAvatarArt emoji={b.targetAvatar} size={16} /> : null}
              <span className="truncate text-[var(--paper)]">{b.toMe ? 'You' : b.targetName}</span>
            </>
          ) : null}
        </p>
        <p className="truncate font-display text-[17px] font-bold leading-tight">{b.label ?? b.emoji}</p>
        <p className="truncate text-[11px] text-[var(--muted)]">{context}</p>
      </div>
    </div>
  );
}
