'use client';

import type { Member, RoomState } from '@/types/exam';
import { Avatar, type AvatarRing } from './ui';

export default function MemberStrip({
  room,
  leaderboard,
  meId,
  revealedToMe,
}: {
  room: RoomState;
  leaderboard: Member[];
  meId: string | null;
  revealedToMe: boolean;
}) {
  const qIdx = room.currentQuestionIndex;

  return (
    <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 pt-2" role="list" aria-label="Members">
      {leaderboard.map((m, rank) => {
        const ans = m.answers[qIdx];
        const isMe = m.id === meId;
        const showResult = !!ans && (room.isRevealed || (room.mode === 'race' && revealedToMe));
        let ring: AvatarRing = 'thinking';
        let status: React.ReactNode;

        if (!ans) {
          ring = 'thinking';
          status = (
            <span className="flex items-center gap-0.5 text-[var(--muted)]">
              Thinking
              <span className="thinking-dots">
                <span />
                <span />
                <span />
              </span>
            </span>
          );
        } else if (showResult) {
          ring = ans.isCorrect ? 'correct' : 'wrong';
          status = ans.isCorrect ? (
            <span key="c" className="pop text-[var(--lime)] tabular">+{ans.pointsEarned}</span>
          ) : (
            <span key="w" className="pop text-[var(--coral)]">Missed</span>
          );
        } else {
          ring = 'locked';
          status = (
            <span key="l" className="pop text-[var(--peri)]">
              Locked in ✓
            </span>
          );
        }

        return (
          <div
            key={m.id}
            role="listitem"
            className="flex w-[68px] shrink-0 flex-col items-center gap-1 rounded-2xl px-1 py-1.5"
            style={isMe ? { background: 'rgba(243,241,234,0.05)' } : undefined}
            aria-label={`${isMe ? 'You' : m.name}, rank ${rank + 1}, ${m.score} points`}
          >
            <div className="relative">
              <Avatar emoji={m.avatar} size={40} ring={ring} badge={m.statusBadge} />
              {m.streak >= 2 ? (
                <span className="pop absolute -bottom-1.5 -left-1.5 flex h-[18px] items-center rounded-full bg-[var(--amber)] px-1 text-[10px] font-bold text-[var(--ink)] tabular shadow">
                  🔥{m.streak}
                </span>
              ) : null}
            </div>
            <span className="w-full truncate text-center text-[11px] font-semibold leading-tight">{isMe ? 'You' : m.name}</span>
            <span className="text-[10px] font-semibold leading-none">{status}</span>
            <span className="code-cell text-[10px] leading-none text-[var(--faint)] tabular">{m.score.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
}
