'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Member, ReactionKind, RoomState, UseRoomReturn } from '@/types/exam';
import { emitLocalReaction } from './EmojiReactionOverlay';
import AnimalAvatarArt from './AnimalAvatarArt';
import { playReactionSound } from '@/lib/sound-fx';
import { haptic } from './ui';

type Relation = 'they-right-me-wrong' | 'both-right' | 'me-right-they-wrong';

const QUICK: Record<Relation, { emoji: string; label: string }[]> = {
  'they-right-me-wrong': [
    { emoji: '💀', label: 'How?!' },
    { emoji: '🫡', label: 'Teach me' },
    { emoji: '😜', label: 'Show off!' },
    { emoji: '😭', label: 'Pain' },
    { emoji: '🔥', label: 'Respect' },
  ],
  'both-right': [
    { emoji: '😜', label: 'Too easy!' },
    { emoji: '🫡', label: 'Twin brain!' },
    { emoji: '🔥', label: 'We cooked' },
    { emoji: '💀', label: 'Light work' },
    { emoji: '😭', label: 'Phew' },
  ],
  'me-right-they-wrong': [
    { emoji: '😜', label: 'Too easy!' },
    { emoji: '💀', label: 'RIP' },
    { emoji: '🫡', label: 'Next one’s yours' },
    { emoji: '😭', label: 'Pain' },
    { emoji: '🔥', label: 'Called it' },
  ],
};

const KIND: Record<Relation, ReactionKind> = {
  'they-right-me-wrong': 'contextual-wrong-right',
  'both-right': 'contextual-both-right',
  'me-right-they-wrong': 'contextual-cheer',
};

interface Target {
  member: Member;
  relation: Relation;
}

/**
 * Slim one-line "react to your friend's answer" bar. Prioritises peers who got it right
 * when you missed; tap the friend chip to cycle through everyone else.
 */
export default function ContextualReactStrip({ api, room }: { api: UseRoomReturn; room: RoomState }) {
  const { me, myCurrentAnswer } = api;
  const qIdx = room.currentQuestionIndex;
  const [cursor, setCursor] = useState(0);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    setCursor(0);
    setSent(null);
  }, [qIdx]);

  const iWasRight = myCurrentAnswer?.isCorrect === true;

  const targets = useMemo<Target[]>(() => {
    if (!me) return [];
    const out: Target[] = [];
    room.members
      .filter((m) => m.id !== me.id && m.answers[qIdx] !== undefined)
      .sort((a, b) => (a.answers[qIdx]?.answeredAt ?? 0) - (b.answers[qIdx]?.answeredAt ?? 0))
      .forEach((m) => {
        const right = m.answers[qIdx]?.isCorrect === true;
        if (!iWasRight && right) out.push({ member: m, relation: 'they-right-me-wrong' });
        else if (iWasRight && right) out.push({ member: m, relation: 'both-right' });
        else if (iWasRight && !right) out.push({ member: m, relation: 'me-right-they-wrong' });
      });
    const order: Relation[] = ['they-right-me-wrong', 'both-right', 'me-right-they-wrong'];
    return out.sort((a, b) => order.indexOf(a.relation) - order.indexOf(b.relation));
  }, [room.members, me, qIdx, iWasRight]);

  if (!me || targets.length === 0) return null;

  const active = targets[cursor % targets.length];
  const caption =
    active.relation === 'they-right-me-wrong'
      ? 'got it right'
      : active.relation === 'both-right'
      ? '& you both got it'
      : 'missed this one';
  const accent =
    active.relation === 'they-right-me-wrong'
      ? 'var(--lime)'
      : active.relation === 'both-right'
      ? 'var(--lime)'
      : 'var(--coral)';

  const fire = (q: { emoji: string; label: string }) => {
    haptic([10, 40, 18]);
    playReactionSound();
    setSent(`${active.member.id}:${q.emoji}`);
    window.setTimeout(() => setSent((s) => (s === `${active.member.id}:${q.emoji}` ? null : s)), 1600);
    const kind = KIND[active.relation];
    emitLocalReaction({
      emoji: q.emoji,
      label: q.label,
      kind,
      targetName: active.member.name,
      targetAvatar: active.member.avatar,
    });
    void api.sendReaction({
      emoji: q.emoji,
      label: q.label,
      kind,
      targetMemberId: active.member.id,
      questionIndex: qIdx,
    });
  };

  return (
    <div
      className="rise flex h-12 items-center gap-2 rounded-full bg-[var(--surface)] pl-1.5 pr-1 shadow-[0_0_0_1px_var(--line)]"
      aria-label={`React to ${active.member.name}`}
    >
      <button
        type="button"
        onClick={() => {
          if (targets.length < 2) return;
          haptic(5);
          setCursor((c) => c + 1);
        }}
        className="press flex min-w-0 flex-1 items-center gap-2 rounded-full py-1 pl-0.5 pr-1 text-left"
        aria-label={targets.length > 1 ? `Reacting to ${active.member.name}. Tap to switch friend` : undefined}
      >
        <span
          key={active.member.id}
          className="pop flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface-3)]"
          style={{ boxShadow: `0 0 0 2px ${accent}` }}
        >
          <AnimalAvatarArt emoji={active.member.avatar} size={36} />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[13px] font-bold">{active.member.name}</span>
          <span className="block truncate text-[11px] text-[var(--muted)]">
            {caption}
            {targets.length > 1 ? ` · ${(cursor % targets.length) + 1}/${targets.length}` : ''}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 items-center">
        {QUICK[active.relation].map((q) => {
          const done = sent === `${active.member.id}:${q.emoji}`;
          return (
            <button
              key={q.emoji}
              type="button"
              onClick={() => fire(q)}
              title={q.label}
              aria-label={`${q.label} to ${active.member.name}`}
              className="press flex h-8 w-8 items-center justify-center rounded-full text-[18px] hover:bg-white/5"
              style={done ? { background: 'var(--paper)' } : undefined}
            >
              <span key={done ? 'd' : 'n'} className={done ? 'emoji-tap inline-block' : 'inline-block'}>
                {q.emoji}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
