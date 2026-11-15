'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import {
  CONTEXTUAL_PEER_RIGHT_REACTIONS,
  CONTEXTUAL_TWIN_RIGHT_REACTIONS,
  type ContextualReactionPreset,
  type Member,
  type RoomState,
  type UseRoomReturn,
} from '@/types/exam';
import { emitLocalReaction } from './EmojiReactionOverlay';
import { haptic } from './ui';

const CHEER_REACTIONS: ContextualReactionPreset[] = [
  { id: 'called-it', emoji: '😎', label: 'Called it', kind: 'contextual-cheer', description: 'Knew it from the start' },
  { id: 'too-easy', emoji: '👑', label: 'Too easy', kind: 'contextual-cheer', description: 'Light work' },
  { id: 'next-one', emoji: '🫶', label: 'Next one’s yours', kind: 'contextual-cheer', description: 'Keep going' },
  { id: 'ez', emoji: '🤭', label: 'Oops for you', kind: 'contextual-cheer', description: 'Playful tease' },
];

type Relation = 'they-right-me-wrong' | 'both-right' | 'me-right-they-wrong';

interface Target {
  member: Member;
  relation: Relation;
}

/**
 * The "they got it right & you got it wrong" strip (plus twin-brain and cheer variants).
 * Lives right under the options once the answer is revealed to the local player.
 */
export default function ContextualReactStrip({ api, room }: { api: UseRoomReturn; room: RoomState }) {
  const { me, myCurrentAnswer } = api;
  const qIdx = room.currentQuestionIndex;
  const [targetId, setTargetId] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, string>>({});

  useEffect(() => {
    setSent({});
    setTargetId(null);
  }, [qIdx]);

  const iWasRight = myCurrentAnswer?.isCorrect === true;

  const targets = useMemo<Target[]>(() => {
    if (!me) return [];
    const others = room.members
      .filter((m) => m.id !== me.id && m.answers[qIdx] !== undefined)
      .sort((a, b) => (a.answers[qIdx]?.answeredAt ?? 0) - (b.answers[qIdx]?.answeredAt ?? 0));
    const out: Target[] = [];
    for (const m of others) {
      const right = m.answers[qIdx]?.isCorrect === true;
      if (!iWasRight && right) out.push({ member: m, relation: 'they-right-me-wrong' });
      else if (iWasRight && right) out.push({ member: m, relation: 'both-right' });
      else if (iWasRight && !right) out.push({ member: m, relation: 'me-right-they-wrong' });
    }
    // Priority: peers who beat me, then twins, then teases
    const order: Relation[] = ['they-right-me-wrong', 'both-right', 'me-right-they-wrong'];
    return out.sort((a, b) => order.indexOf(a.relation) - order.indexOf(b.relation));
  }, [room.members, me, qIdx, iWasRight]);

  if (!me || targets.length === 0) return null;

  const active = targets.find((t) => t.member.id === targetId) ?? targets[0];
  const presets =
    active.relation === 'they-right-me-wrong'
      ? CONTEXTUAL_PEER_RIGHT_REACTIONS
      : active.relation === 'both-right'
      ? CONTEXTUAL_TWIN_RIGHT_REACTIONS
      : CHEER_REACTIONS;

  const first = active.member.name;
  const heading =
    active.relation === 'they-right-me-wrong'
      ? `React to ${first}'s correct answer!`
      : active.relation === 'both-right'
      ? `You and ${first} both nailed it`
      : `${first} missed this one`;
  const sub =
    active.relation === 'they-right-me-wrong'
      ? 'They got it, you didn’t. Say something.'
      : active.relation === 'both-right'
      ? 'Great minds. Let them know.'
      : 'Cheer them on, or tease a little.';

  const fire = (p: ContextualReactionPreset) => {
    haptic([10, 40, 18]);
    setSent((s) => ({ ...s, [active.member.id]: `${p.emoji} ${p.label}` }));
    emitLocalReaction({
      emoji: p.emoji,
      label: p.label,
      kind: p.kind,
      targetName: active.member.name,
      targetAvatar: active.member.avatar,
    });
    void api.sendReaction({
      emoji: p.emoji,
      label: p.label,
      kind: p.kind,
      targetMemberId: active.member.id,
      questionIndex: qIdx,
    });
  };

  const accent =
    active.relation === 'they-right-me-wrong' ? 'var(--coral)' : active.relation === 'both-right' ? 'var(--lime)' : 'var(--amber)';
  const sentLine = sent[active.member.id];

  return (
    <section
      className="rise relative overflow-hidden rounded-[22px] bg-[var(--surface)] p-3.5"
      style={{ boxShadow: `0 0 0 1px var(--line), inset 0 1px 0 rgba(255,255,255,0.04)` }}
      aria-label="Contextual reactions"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full opacity-25 blur-2xl"
        style={{ background: accent }}
      />
      <div className="relative flex items-start gap-3">
        <span className="pop mt-0.5 text-[30px] leading-none" key={active.member.id}>
          {active.member.avatar}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[16px] font-bold leading-tight [text-wrap:balance]">{heading}</h3>
          <p className="mt-0.5 text-xs text-[var(--muted)]">{sub}</p>
        </div>
      </div>

      {targets.length > 1 ? (
        <div className="no-scrollbar relative -mx-3.5 mt-3 flex gap-1.5 overflow-x-auto px-3.5">
          {targets.map((t) => {
            const on = t.member.id === active.member.id;
            const right = t.relation !== 'me-right-they-wrong';
            return (
              <button
                key={t.member.id}
                type="button"
                onClick={() => {
                  haptic(5);
                  setTargetId(t.member.id);
                }}
                className="press flex h-8 shrink-0 items-center gap-1.5 rounded-full pl-1 pr-2.5 text-xs font-semibold"
                style={{
                  background: on ? 'var(--paper)' : 'var(--surface-2)',
                  color: on ? 'var(--ink)' : 'var(--paper)',
                  boxShadow: on ? 'none' : `0 0 0 1px ${right ? 'rgba(215,255,63,0.35)' : 'rgba(255,106,85,0.35)'}`,
                }}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/20 text-sm">{t.member.avatar}</span>
                {t.member.name}
                {sent[t.member.id] ? <Check size={12} strokeWidth={3} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="relative mt-3 grid grid-cols-3 gap-1.5">
        {presets.slice(0, 6).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => fire(p)}
            title={p.description}
            className="press flex flex-col items-center justify-center gap-0.5 rounded-2xl bg-[var(--surface-2)] py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_0_-2px_0_rgba(0,0,0,0.35),0_0_0_1px_var(--line)] hover:bg-[var(--surface-3)]"
          >
            <span className="text-[22px] leading-none">{p.emoji}</span>
            <span className="text-[11px] font-semibold text-[var(--muted)]">{p.label}</span>
          </button>
        ))}
      </div>

      {sentLine ? (
        <p key={sentLine} className="pop relative mt-3 flex items-center justify-center gap-1.5 rounded-full bg-[var(--ink-2)] px-3 py-1.5 text-center text-xs font-medium">
          <span>{me.avatar}</span> You reacted <span className="font-bold">{sentLine}</span> to{' '}
          <span>
            {active.member.avatar} {active.member.name}
            {active.relation === 'they-right-me-wrong' ? '’s right answer' : ''}
          </span>
        </p>
      ) : null}
    </section>
  );
}
