'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Check,
  Copy,
  FileText,
  FileUp,
  Hand,
  Infinity as InfinityIcon,
  Loader2,
  LogOut,
  Pencil,
  Play,
  Plus,
  Send,
  Share2,
  SlidersHorizontal,
  Timer,
  Users,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import type { ConnectionStatus, GameMode, UseRoomReturn } from '@/types/exam';
import { playExamStartSound, playLockSound, playTapSound } from '@/lib/sound-fx';
import { Avatar, copyText, haptic } from './ui';
import AnimalAvatarArt from './AnimalAvatarArt';
import { InstallAppButton } from './InstallAppSheet';

const MarkdownQuestionModal = dynamic(() => import('./MarkdownQuestionModal'), { ssr: false });
const ProfileEditSheet = dynamic(() => import('./ProfileEditSheet'), { ssr: false });

const TIMES = [0, 15, 30, 45, 60, 90];

const MODES: { id: GameMode; title: string; short: string; icon: typeof Users; color: string }[] = [
  {
    id: 'wait',
    title: 'Wait for all',
    short: 'Reveal together',
    icon: Users,
    color: 'var(--peri)',
  },
  {
    id: 'race',
    title: 'Race',
    short: 'Live speed bonus',
    icon: Zap,
    color: 'var(--amber)',
  },
];

export default function RoomLobby({ api }: { api: UseRoomReturn }) {
  const { room, me, isHost, account, allMembersReady, readyCount } = api;
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [invitedUsernames, setInvitedUsernames] = useState<Record<string, boolean>>({});
  const [invitingUsername, setInvitingUsername] = useState<string | null>(null);

  const inviteUrl = useMemo(() => {
    if (!room || typeof window === 'undefined') return '';
    return `${window.location.origin}${window.location.pathname}?room=${room.code}`;
  }, [room]);

  if (!room) return null;

  const flashCopied = (kind: 'code' | 'link') => {
    setCopied(kind);
    haptic([8, 40, 8]);
    window.setTimeout(() => setCopied(null), 1600);
  };

  const share = async () => {
    const data = {
      title: `Join my exam room ${room.code}`,
      text: `Join "${room.title}" on Exam Room. Code: ${room.code}`,
      url: inviteUrl,
    };
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share(data);
        return;
      } catch {
        /* user cancelled or unsupported: fall back to copying */
      }
    }
    if (await copyText(inviteUrl)) flashCopied('link');
  };

  const handleToggleReady = async () => {
    if (!hasQuestions) return;
    haptic([10, 35, 10]);
    playLockSound();
    await api.toggleReady(!me?.isReady);
  };

  const start = async () => {
    if (!hasQuestions || !allMembersReady) return;
    setStarting(true);
    haptic([12, 40, 20]);
    playExamStartSound();
    await api.startExam();
    setStarting(false);
  };

  const sendFriendInvite = async (friendUsername: string) => {
    setInvitingUsername(friendUsername);
    haptic(8);
    const ok = await api.inviteFriendToRoom(friendUsername);
    setInvitingUsername(null);
    if (ok) {
      setInvitedUsernames((prev) => ({ ...prev, [friendUsername]: true }));
    }
  };

  const playerCount = room.members.length;
  const hasQuestions = room.questions.length > 0;
  const amReady = Boolean(me?.isReady);
  const notReadyNames = room.members.filter((m) => !m.isReady).map((m) => m.name);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scroll-area">
        <div className="pt-safe px-4 pb-4">
          {api.isLocalOffline || api.syncPendingCount > 0 ? (
            <div
              className="mb-2 flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-1 text-[11px] font-semibold"
              style={{
                background: api.isLocalOffline
                  ? 'rgba(255, 106, 85, 0.16)'
                  : 'rgba(255, 176, 46, 0.16)',
                color: api.isLocalOffline ? 'var(--coral)' : 'var(--amber)',
              }}
              role="status"
            >
              <WifiOff size={12} />
              {api.isLocalOffline
                ? 'Offline — changes queued, reconnecting…'
                : `Syncing (${api.syncPendingCount})…`}
            </div>
          ) : null}

          {/* Top bar */}
          <header className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              className="press flex h-8 items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-3 text-xs font-medium text-[var(--muted)] shadow-[0_0_0_1px_var(--line)]"
              onClick={() => {
                if (confirmLeave) api.leaveRoom();
                else {
                  setConfirmLeave(true);
                  window.setTimeout(() => setConfirmLeave(false), 2500);
                }
              }}
              style={confirmLeave ? { color: 'var(--coral)' } : undefined}
            >
              <LogOut size={13} />
              {confirmLeave ? 'Tap to leave' : 'Leave'}
            </button>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  haptic(6);
                  setProfileOpen(true);
                }}
                aria-label="Edit profile and app layout"
                className="press flex h-8 items-center gap-1.5 rounded-full bg-[var(--surface-2)] pl-1 pr-2 text-xs font-semibold text-[var(--paper)] shadow-[0_0_0_1px_var(--line)]"
              >
                <AnimalAvatarArt emoji={me?.avatar || '🐥'} size={20} />
                <SlidersHorizontal size={12} className="text-[var(--muted)]" />
              </button>
              <InstallAppButton compact />
              <span className="flex h-8 items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-2.5 text-xs font-semibold text-[var(--muted)] shadow-[0_0_0_1px_var(--line)]">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--lime)]" />
                {playerCount}
              </span>
            </div>
          </header>

          {/* Compact Room Code Bar */}
          <section className="rise mt-3 text-center">
            <button
              type="button"
              onClick={async () => {
                if (await copyText(room.code)) flashCopied('code');
              }}
              className="press mx-auto flex items-center justify-center gap-1.5"
              aria-label={`Copy room code ${room.code}`}
            >
              {room.code.split('').map((ch, i) => (
                <span
                  key={i}
                  className="code-cell flex h-11 w-9 items-center justify-center rounded-xl bg-[var(--surface)] text-xl font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-2px_0_rgba(0,0,0,0.35),0_0_0_1px_var(--line)]"
                >
                  {ch}
                </span>
              ))}
            </button>
            <div className="mt-2 flex justify-center gap-1.5">
              <button
                type="button"
                className="chip !h-7 !min-h-0 !px-2.5 text-xs"
                data-active={copied === 'code'}
                onClick={async () => {
                  if (await copyText(room.code)) flashCopied('code');
                }}
              >
                {copied === 'code' ? <Check size={12} /> : <Copy size={12} />}
                {copied === 'code' ? 'Copied' : 'Copy code'}
              </button>
              <button
                type="button"
                className="chip !h-7 !min-h-0 !px-2.5 text-xs"
                data-active={copied === 'link'}
                onClick={share}
              >
                {copied === 'link' ? <Check size={12} /> : <Share2 size={12} />}
                {copied === 'link' ? 'Link copied' : 'Share link'}
              </button>
            </div>
          </section>

          {/* Members + Ready Badges */}
          <section className="panel rise mt-3 p-3" style={{ animationDelay: '40ms' }}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold">In the room</h2>
              <span className="text-[11px] font-semibold text-[var(--muted)] tabular">
                {hasQuestions
                  ? `Ready: ${readyCount}/${playerCount}`
                  : `${playerCount} ${playerCount === 1 ? 'player' : 'players'}`}
              </span>
            </div>
            <ul className="mt-2.5 grid grid-cols-4 gap-x-2 gap-y-2.5">
              {room.members.map((m, i) => {
                const mReady = Boolean(m.isReady);
                const conn: ConnectionStatus =
                  api.memberConnectionStatus[m.id] ?? m.connectionStatus ?? 'online';
                return (
                  <li
                    key={m.id}
                    className="pop relative flex flex-col items-center gap-1"
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <span className="relative inline-flex">
                      <Avatar
                        emoji={m.avatar}
                        size={38}
                        host={m.id === room.hostId}
                        badge={m.statusBadge}
                        ring={
                          hasQuestions
                            ? mReady
                              ? 'correct'
                              : 'thinking'
                            : m.id === me?.id
                            ? 'me'
                            : 'none'
                        }
                      />
                      <span
                        className="absolute -left-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--surface)]"
                        style={{
                          background:
                            conn === 'offline'
                              ? 'var(--coral)'
                              : conn === 'weak'
                              ? 'var(--amber)'
                              : 'var(--lime)',
                        }}
                        title={conn}
                      />
                    </span>
                    <span className="w-full truncate text-center text-[11px] font-semibold">
                      {m.id === me?.id ? 'You' : m.name}
                    </span>
                    {conn === 'offline' ? (
                      <span className="-mt-0.5 inline-flex items-center rounded-full bg-[rgba(255,106,85,0.16)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--coral)]">
                        Offline
                      </span>
                    ) : hasQuestions ? (
                      <span
                        className="-mt-0.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                        style={{
                          background: mReady ? 'rgba(215, 255, 63, 0.16)' : 'var(--surface-2)',
                          color: mReady ? 'var(--lime)' : 'var(--muted)',
                        }}
                      >
                        {mReady ? 'Ready ✓' : 'Waiting'}
                      </span>
                    ) : null}
                    {isHost && m.id !== me?.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          haptic(6);
                          void api.removeMember(m.id);
                        }}
                        className="press absolute -top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--surface-3)] text-[var(--muted)] shadow-[0_0_0_1px_var(--line)]"
                        aria-label={`Remove ${m.name}`}
                      >
                        <X size={10} strokeWidth={3} />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {/* Quick Invite Friends row */}
            {account && account.friends.length > 0 ? (
              <div className="mt-2.5 border-t border-[var(--line)] pt-2">
                <div className="no-scrollbar -mx-3 flex items-center gap-1.5 overflow-x-auto px-3">
                  <span className="shrink-0 text-[11px] font-semibold text-[var(--muted)]">Invite:</span>
                  {account.friends.map((f) => {
                    const alreadyInRoom = room.members.some(
                      (m) =>
                        (m.username && m.username.toLowerCase() === f.username.toLowerCase()) ||
                        (m.email && f.email && m.email.toLowerCase() === f.email.toLowerCase())
                    );
                    const invited = invitedUsernames[f.username];
                    const sending = invitingUsername === f.username;
                    return (
                      <button
                        key={f.username}
                        type="button"
                        disabled={alreadyInRoom || sending}
                        onClick={() => void sendFriendInvite(f.username)}
                        className="chip !h-7 !min-h-0 shrink-0 !px-2 text-[11px]"
                        data-active={invited}
                      >
                        <AnimalAvatarArt emoji={f.avatar || '🐥'} size={16} />
                        <span className="max-w-[90px] truncate">@{f.username}</span>
                        {alreadyInRoom ? (
                          <span className="text-[10px] text-[var(--lime)]">In</span>
                        ) : sending ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : invited ? (
                          <Check size={11} />
                        ) : (
                          <Send size={10} className="text-[var(--lime)]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>

          {/* Clean 1-Row Exam Questions Card */}
          <section
            className="panel rise mt-3 p-3"
            style={{
              animationDelay: '70ms',
              boxShadow: !hasQuestions ? '0 0 0 1.5px var(--lime)' : undefined,
            }}
          >
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    background: hasQuestions ? 'var(--surface-2)' : 'rgba(215, 255, 63, 0.16)',
                    color: 'var(--lime)',
                  }}
                >
                  {hasQuestions ? <FileText size={16} /> : <FileUp size={16} />}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-bold">
                    {hasQuestions ? room.title : 'Exam Questions'}
                  </p>
                  <p className="text-[11px] font-semibold tabular" style={{ color: hasQuestions ? 'var(--lime)' : 'var(--muted)' }}>
                    {hasQuestions ? `${room.questions.length} ready` : '0 added'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  haptic(6);
                  setStudioOpen(true);
                }}
                className={
                  hasQuestions
                    ? 'btn-secondary !min-h-[36px] shrink-0 !rounded-xl !px-3 text-xs'
                    : 'btn-primary !min-h-[36px] shrink-0 !rounded-xl !px-3.5 text-xs'
                }
              >
                {hasQuestions ? <Pencil size={13} /> : <Plus size={14} strokeWidth={2.6} />}
                {hasQuestions ? 'Edit' : 'Add'}
              </button>
            </div>
          </section>

          {/* Compact 2-Column Mode Selector + Timer */}
          <section className="rise mt-3" style={{ animationDelay: '100ms' }}>
            <div className="mb-1.5 flex items-baseline justify-between px-0.5">
              <h2 className="font-display text-sm font-bold">How we play</h2>
              {!isHost ? <span className="text-[11px] text-[var(--muted)]">Host decides</span> : null}
            </div>
            <div role="radiogroup" aria-label="Game mode" className="grid grid-cols-2 gap-2">
              {MODES.map((m) => {
                const active = room.mode === m.id;
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={!isHost}
                    onClick={() => {
                      if (active) return;
                      haptic(10);
                      playTapSound();
                      void api.updateSettings({ mode: m.id });
                    }}
                    className="press relative flex items-center gap-2 rounded-2xl p-2.5 text-left disabled:cursor-default"
                    style={{
                      background: active ? 'var(--surface-2)' : 'var(--surface)',
                      boxShadow: active
                        ? `0 0 0 2px ${m.color}`
                        : '0 0 0 1px var(--line)',
                      opacity: !isHost && !active ? 0.55 : 1,
                    }}
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                      style={{
                        background: active ? m.color : 'var(--surface-3)',
                        color: active ? 'var(--ink)' : m.color,
                      }}
                    >
                      <Icon size={16} strokeWidth={2.4} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-xs font-bold leading-tight">
                        {m.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-[var(--muted)]">
                        {m.short}
                      </span>
                    </span>
                    {active ? (
                      <span
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                        style={{ background: m.color }}
                      >
                        <Check size={10} strokeWidth={3.5} className="text-[var(--ink)]" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="no-scrollbar mt-2 flex items-center gap-1.5 overflow-x-auto px-0.5">
              <span className="flex shrink-0 items-center gap-1 pr-1 text-[11px] font-semibold text-[var(--muted)]">
                <Timer size={12} /> Timer
              </span>
              {TIMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="chip !h-7 !min-h-0 shrink-0 !px-2.5 text-xs tabular"
                  data-active={room.timePerQuestion === t}
                  disabled={!isHost}
                  onClick={() => {
                    haptic(5);
                    playTapSound();
                    void api.updateSettings({ timePerQuestion: t });
                  }}
                >
                  {t === 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <InfinityIcon size={12} /> Off
                    </span>
                  ) : (
                    `${t}s`
                  )}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Sticky Mutual Ready / Start Footer */}
      <div className="pb-safe relative z-10 border-t border-[var(--line)] bg-[rgba(14,15,19,0.9)] px-4 pt-2.5 backdrop-blur">
        {!hasQuestions ? (
          <button
            type="button"
            className="btn-primary h-12 w-full text-sm"
            disabled
          >
            Add questions above to start
          </button>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-0.5 text-[11px] font-semibold text-[var(--muted)]">
              <span className="tabular">
                Ready: {readyCount}/{playerCount}
              </span>
              <span className="truncate">
                {allMembersReady ? 'Everyone is ready!' : `Waiting on ${notReadyNames.join(', ')}`}
              </span>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleToggleReady()}
                className={`h-12 flex-1 text-sm ${amReady ? 'btn-secondary' : 'btn-primary'}`}
                style={
                  amReady
                    ? {
                        boxShadow: '0 0 0 2px var(--lime), inset 0 -2px 0 rgba(0,0,0,0.35)',
                        color: 'var(--lime)',
                      }
                    : undefined
                }
              >
                {amReady ? <Check size={17} strokeWidth={2.8} /> : <Hand size={17} />}
                {amReady ? 'Ready ✓' : "I'm Ready!"}
              </button>

              {isHost && playerCount === 1 && allMembersReady ? (
                <button
                  type="button"
                  onClick={start}
                  disabled={starting}
                  className="btn-primary h-12 shrink-0 px-4 text-sm"
                >
                  {starting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />}
                  Start Solo
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <MarkdownQuestionModal open={studioOpen} onClose={() => setStudioOpen(false)} api={api} />
      <ProfileEditSheet open={profileOpen} onClose={() => setProfileOpen(false)} api={api} />
    </div>
  );
}
