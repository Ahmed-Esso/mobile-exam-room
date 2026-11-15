'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, X } from 'lucide-react';
import { useRoom } from '@/hooks/useRoom';
import LobbyView from '@/components/LobbyView';
import ExamArenaView from '@/components/ExamArenaView';
import ResultsView from '@/components/ResultsView';
import EmojiReactionOverlay from '@/components/EmojiReactionOverlay';
import PullToRefresh from '@/components/PullToRefresh';
import { AVATAR_OPTIONS, type RoomInvite } from '@/types/exam';
import { autoName, readProfile } from '@/components/profile';
import { haptic } from '@/components/ui';

const STORAGE_ACTIVE_ROOM_KEY = 'exam_room_active_code_v1';

export default function HomePage() {
  const api = useRoom();
  const { room, me, account, error, clearError } = api;
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [rejoinCode, setRejoinCode] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params
        .get('room')
        ?.trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 6);
      if (roomParam && roomParam.length === 6) {
        setInviteCode(roomParam);
      }
      const saved = window.localStorage.getItem(STORAGE_ACTIVE_ROOM_KEY);
      if (saved && saved.length === 6) {
        setRejoinCode(saved);
      }
    } catch {
      /* ignore URL/storage access issues */
    }
  }, []);

  const activeInvites: RoomInvite[] = (account?.invites ?? []).filter(
    (inv) => inv.roomCode !== room?.code
  );
  const latestInvite = activeInvites[0] ?? null;

  const acceptInvite = async (inv: RoomInvite) => {
    haptic([10, 30, 10]);
    const prof = readProfile();
    const joinAvatar = account?.avatar || prof?.avatar || AVATAR_OPTIONS[0];
    const joinName = account?.name || prof?.name || autoName(joinAvatar);
    await api.dismissRoomInvite(inv.id);
    await api.joinRoom({
      code: inv.roomCode,
      name: joinName,
      avatar: joinAvatar,
    });
  };

  const handlePullRefresh = async () => {
    if (room || account) {
      await api.refreshRoomAndAccount();
    } else if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <main className="stage">
      <div className="phone" data-mode={room?.mode ?? 'wait'}>
        <div className="screen">
          {/* Live Incoming Friend Room Invite Banner */}
          {latestInvite ? (
            <div className="banner-in pt-safe absolute inset-x-4 top-2 z-50">
              <div className="glass flex items-center gap-2.5 rounded-2xl px-3 py-2.5 shadow-[0_0_0_1.5px_var(--lime),0_18px_40px_-14px_rgba(0,0,0,0.85)]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-xl">
                  {latestInvite.fromAvatar || '🐥'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-[var(--paper)]">
                    @{latestInvite.fromUsername} invited you to Room{' '}
                    <span className="code-cell text-[var(--lime)]">{latestInvite.roomCode}</span>
                  </p>
                  <p className="truncate text-[11px] text-[var(--muted)]">
                    {latestInvite.roomTitle}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void acceptInvite(latestInvite)}
                  className="btn-primary !min-h-[36px] shrink-0 !rounded-xl !px-3 text-xs"
                >
                  Join <ArrowRight size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => void api.dismissRoomInvite(latestInvite.id)}
                  className="press rounded-full p-1 text-[var(--muted)] hover:text-[var(--paper)]"
                  aria-label="Dismiss invite"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : null}

          {/* Dismissible error toast */}
          {error ? (
            <div
              role="alert"
              className="banner-in pt-safe absolute inset-x-4 top-2 z-50"
              style={latestInvite ? { top: 'calc(max(var(--safe-top), 14px) + 64px)' } : undefined}
            >
              <div className="flex items-center gap-2.5 rounded-2xl bg-[#2a1714] px-3.5 py-2.5 text-xs font-semibold text-[var(--paper)] shadow-[0_0_0_1.5px_var(--coral),0_16px_32px_-12px_rgba(0,0,0,0.85)]">
                <AlertCircle size={16} className="shrink-0 text-[var(--coral)]" />
                <span className="flex-1 leading-snug">{error}</span>
                <button
                  type="button"
                  onClick={clearError}
                  className="press rounded-full p-1 text-[var(--muted)] hover:text-[var(--paper)]"
                  aria-label="Dismiss error"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : null}

          {/* Screen router wrapped with PullToRefresh */}
          <PullToRefresh onRefresh={handlePullRefresh}>
            {!room || room.status === 'lobby' ? (
              <LobbyView api={api} inviteCode={inviteCode} rejoinCode={rejoinCode} />
            ) : room.status === 'active' ? (
              <ExamArenaView api={api} />
            ) : (
              <ResultsView api={api} />
            )}
          </PullToRefresh>

          {/* Global Zoom/Teams & Contextual Floating Reaction Overlay */}
          {room ? (
            <EmojiReactionOverlay
              reactions={api.activeReactions}
              meId={me?.id ?? null}
              meName={me?.name ?? 'You'}
              meAvatar={me?.avatar ?? '🐥'}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}
