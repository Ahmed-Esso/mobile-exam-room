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
    <div
      className="no-scrollbar -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 pt-2"
      role="list"
      aria-label="Members"
    >
      {leaderboard.map((m, rank) => {
        const ans = m.answers[qIdx];
        const isMe = m.id === meId;
        const showResult = !!ans && revealedToMe;
        let ring: AvatarRing = 'thinking';
        let status: React.ReactNode;

        if (!ans) {
          ring = 'thinking';
          status = (
            <span className="thinking-dots px-0.5 text-[var(--muted)]" aria-label="Thinking">
              <span />
              <span />
              <span />
            </span>
          );
        } else if (showResult) {
          ring = ans.isCorrect ? 'correct' : 'wrong';
          status = ans.isCorrect ? (
            <span key="c" className="pop font-bold text-[var(--lime)] tabular">
              ✓ +{ans.pointsEarned}
            </span>
          ) : (
            <span key="w" className="pop font-bold text-[var(--coral)]">
              ✕
            </span>
          );
        } else {
          ring = 'locked';
          status = (
            <span key="l" className="pop font-semibold text-[var(--peri)]">
              Locked ✓
            </span>
          );
        }

        return (
          <div
            key={m.id}
            role="listitem"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs shadow-[0_0_0_1px_var(--line)]"
            style={{
              background: isMe ? 'rgba(243, 241, 234, 0.08)' : 'var(--surface)',
            }}
            aria-label={`${isMe ? 'You' : m.name}, rank ${rank + 1}, ${m.score} points`}
          >
            <Avatar emoji={m.avatar} size={22} ring={ring} badge={m.statusBadge} />
            <span className="max-w-[72px] truncate font-semibold">
              {isMe ? 'You' : m.name}
            </span>
            {m.streak >= 2 ? (
              <span className="text-[10px] font-bold text-[var(--amber)] tabular">
                🔥{m.streak}
              </span>
            ) : null}
            {status}
          </div>
        );
      })}
    </div>
  );
}
