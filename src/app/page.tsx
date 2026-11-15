'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { useRoom } from '@/hooks/useRoom';
import LobbyView from '@/components/LobbyView';
import ExamArenaView from '@/components/ExamArenaView';
import ResultsView from '@/components/ResultsView';
import EmojiReactionOverlay from '@/components/EmojiReactionOverlay';

const STORAGE_ACTIVE_ROOM_KEY = 'exam_room_active_code_v1';

export default function HomePage() {
  const api = useRoom();
  const { room, me, error, clearError } = api;
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [rejoinCode, setRejoinCode] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room')?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
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

  return (
    <main className="stage">
      <div className="phone" data-mode={room?.mode ?? 'wait'}>
        <div className="screen">
          {/* Dismissible error toast */}
          {error ? (
            <div
              role="alert"
              className="banner-in pt-safe absolute inset-x-4 top-2 z-50"
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

          {/* Screen router */}
          {!room || room.status === 'lobby' ? (
            <LobbyView api={api} inviteCode={inviteCode} rejoinCode={rejoinCode} />
          ) : room.status === 'active' ? (
            <ExamArenaView api={api} />
          ) : (
            <ResultsView api={api} />
          )}

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
