'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Hand, SmilePlus, X } from 'lucide-react';
import { STATUS_BADGES, ZOOM_REACTIONS, type UseRoomReturn } from '@/types/exam';
import { emitLocalReaction } from './EmojiReactionOverlay';
import { haptic } from './ui';

const LABELS: Record<string, string> = {
  '🐥': 'Chick',
  '😂': 'Laugh',
  '🔥': 'Fire',
  '👏': 'Clap',
  '❤️': 'Love',
  '🎉': 'Party',
  '🤔': 'Hmm',
  '💀': 'Dead',
  '😭': 'Crying',
  '🫡': 'Salute',
};

/**
 * Zoom/Teams style reaction dock. Collapsed by default into a small "React" pill so it
 * stays out of the way; `leading` lets a screen put its main action (e.g. Next) beside it.
 */
export default function ReactionDock({ api, leading }: { api: UseRoomReturn; leading?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [tapped, setTapped] = useState<{ emoji: string; n: number } | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const lastSent = useRef(0);
  const popRef = useRef<HTMLDivElement>(null);
  const badge = api.me?.statusBadge ?? null;

  useEffect(() => {
    if (!statusOpen) return;
    const onDown = (e: PointerEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setStatusOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [statusOpen]);

  const send = (emoji: string) => {
    const now = Date.now();
    setTapped((t) => ({ emoji, n: (t?.n ?? 0) + 1 }));
    if (now - lastSent.current < 220) return; // gentle spam guard
    lastSent.current = now;
    haptic(7);
    emitLocalReaction({ emoji, kind: 'general' });
    void api.sendReaction({ emoji, kind: 'general' });
  };

  const setBadge = (next: string | null) => {
    haptic(next ? [8, 30, 8] : 6);
    setStatusOpen(false);
    if (next) emitLocalReaction({ emoji: next, kind: 'status', label: 'Status' });
    void api.setStatusBadge(next);
  };

  const toggle = () => {
    haptic(6);
    setOpen((v) => !v);
    setStatusOpen(false);
  };

  return (
    <div className="pb-safe relative z-30 border-t border-[var(--line)] bg-[rgba(14,15,19,0.9)] px-3 pt-2 backdrop-blur-md">
      {/* Status popover */}
      {statusOpen ? (
        <div
          ref={popRef}
          className="sheet glass absolute bottom-full right-3 mb-2 w-56 rounded-[22px] p-2 shadow-[0_0_0_1px_var(--line-strong),0_24px_50px_-16px_rgba(0,0,0,0.9)]"
          role="menu"
        >
          <p className="px-2.5 pb-1.5 pt-1 text-xs font-semibold text-[var(--muted)]">Show a status on your avatar</p>
          {STATUS_BADGES.map((s) => (
            <button
              key={s.emoji}
              type="button"
              role="menuitemradio"
              aria-checked={badge === s.emoji}
              onClick={() => setBadge(badge === s.emoji ? null : s.emoji)}
              className="press flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left text-sm font-medium hover:bg-white/5"
              style={badge === s.emoji ? { background: 'var(--paper)', color: 'var(--ink)' } : undefined}
            >
              <span className="text-xl">{s.emoji}</span>
              {s.label}
            </button>
          ))}
          {badge ? (
            <button
              type="button"
              onClick={() => setBadge(null)}
              className="press mt-1 flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left text-sm font-medium text-[var(--muted)] hover:bg-white/5"
            >
              <X size={18} className="mx-0.5" /> Clear status
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Expanded emoji strip */}
      {open ? (
        <div className="rise mb-2 flex items-center gap-1 rounded-[22px] bg-[var(--surface)] p-1 shadow-[0_0_0_1px_var(--line)]">
          <div
            className="no-scrollbar flex min-w-0 flex-1 items-center overflow-x-auto"
            style={{
              maskImage: 'linear-gradient(90deg, #000 90%, transparent)',
              WebkitMaskImage: 'linear-gradient(90deg, #000 90%, transparent)',
            }}
            role="toolbar"
            aria-label="Send a reaction"
          >
            {ZOOM_REACTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => send(e)}
                aria-label={`React ${LABELS[e] ?? e}`}
                className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[24px] hover:bg-white/5 active:bg-white/10"
              >
                <span
                  key={tapped?.emoji === e ? tapped.n : 0}
                  className={tapped?.emoji === e ? 'emoji-tap inline-block' : 'inline-block'}
                >
                  {e}
                </span>
              </button>
            ))}
          </div>
          <span className="h-7 w-px shrink-0 bg-[var(--line-strong)]" aria-hidden />
          <button
            type="button"
            onClick={() => {
              haptic(6);
              setStatusOpen((v) => !v);
            }}
            aria-haspopup="menu"
            aria-expanded={statusOpen}
            aria-label={badge ? `Status ${badge}. Change status` : 'Raise hand or set a status'}
            className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{
              background: badge ? 'var(--paper)' : 'var(--surface-3)',
              color: badge ? 'var(--ink)' : 'var(--paper)',
            }}
          >
            {badge ? <span className="pop text-lg leading-none">{badge}</span> : <Hand size={18} />}
          </button>
        </div>
      ) : null}

      {/* Bottom row: screen action + React pill */}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{leading}</div>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? 'Hide reactions' : 'Show reactions'}
          className="press flex h-12 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold"
          style={{
            background: open ? 'var(--paper)' : 'var(--surface-2)',
            color: open ? 'var(--ink)' : 'var(--paper)',
            boxShadow: open ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px var(--line)',
          }}
        >
          {open ? (
            <X size={17} strokeWidth={2.5} />
          ) : (
            <>
              {badge ? <span className="text-base leading-none">{badge}</span> : <SmilePlus size={17} />}
              React
            </>
          )}
        </button>
      </div>
    </div>
  );
}
