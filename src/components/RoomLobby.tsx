'use client';

import { useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  Copy,
  FileText,
  FileUp,
  Hand,
  Hourglass,
  Infinity as InfinityIcon,
  Loader2,
  LogOut,
  Pencil,
  Play,
  Send,
  Share2,
  Sparkles,
  Timer,
  Users,
  X,
  Zap,
} from 'lucide-react';
import type { GameMode, UseRoomReturn } from '@/types/exam';
import { Avatar, Markdown, copyText, haptic } from './ui';
import AnimalAvatarArt from './AnimalAvatarArt';
import MarkdownQuestionModal from './MarkdownQuestionModal';
import ProfileEditSheet from './ProfileEditSheet';
import { InstallAppButton } from './InstallAppSheet';

const TIMES = [0, 15, 30, 45, 60, 90];

const MODES: { id: GameMode; title: string; body: string; icon: typeof Users; color: string }[] = [
  {
    id: 'wait',
    title: 'Wait for everyone',
    body: 'Answers stay hidden until the whole room locks in. Then every pick reveals at once.',
    icon: Users,
    color: 'var(--peri)',
  },
  {
    id: 'race',
    title: 'Race',
    body: 'Picks land live as people answer. First correct answers earn the biggest speed bonus.',
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
    await api.toggleReady(!me?.isReady);
  };

  const start = async () => {
    if (!hasQuestions || !allMembersReady) return;
    setStarting(true);
    haptic([12, 40, 20]);
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
        <div className="pt-safe px-5 pb-6">
          {/* Top bar */}
          <header className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              className="press flex h-10 items-center gap-2 rounded-full bg-[var(--surface-2)] px-3.5 text-sm font-medium text-[var(--muted)] shadow-[0_0_0_1px_var(--line)]"
              onClick={() => {
                if (confirmLeave) api.leaveRoom();
                else {
                  setConfirmLeave(true);
                  window.setTimeout(() => setConfirmLeave(false), 2500);
                }
              }}
              style={confirmLeave ? { color: 'var(--coral)' } : undefined}
            >
              <LogOut size={16} />
              {confirmLeave ? 'Tap again to leave' : 'Leave'}
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  haptic(6);
                  setProfileOpen(true);
                }}
                aria-label="Edit profile"
                className="press flex h-9 items-center gap-1.5 rounded-full bg-[var(--surface-2)] pl-1.5 pr-2.5 text-xs font-semibold text-[var(--paper)] shadow-[0_0_0_1px_var(--line)]"
              >
                <AnimalAvatarArt emoji={me?.avatar || '🐥'} size={22} />
                <span>Profile</span>
                <Pencil size={11} className="text-[var(--muted)]" />
              </button>
              <InstallAppButton compact />
              <span className="flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] shadow-[0_0_0_1px_var(--line)]">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--lime)]" />
                {playerCount} {playerCount === 1 ? 'player' : 'players'}
              </span>
            </div>
          </header>

          {/* Room code hero */}
          <section className="rise mt-6 text-center">
            <p className="text-sm font-medium text-[var(--muted)]">Room code</p>
            <button
              type="button"
              onClick={async () => {
                if (await copyText(room.code)) flashCopied('code');
              }}
              className="press mx-auto mt-2 flex items-center justify-center gap-1.5"
              aria-label={`Copy room code ${room.code}`}
            >
              {room.code.split('').map((ch, i) => (
                <span
                  key={i}
                  className="code-cell flex h-14 w-11 items-center justify-center rounded-[14px] bg-[var(--surface)] text-[28px] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-3px_0_rgba(0,0,0,0.35),0_0_0_1px_var(--line)]"
                >
                  {ch}
                </span>
              ))}
            </button>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                className="chip"
                data-active={copied === 'code'}
                onClick={async () => {
                  if (await copyText(room.code)) flashCopied('code');
                }}
              >
                {copied === 'code' ? <Check size={15} /> : <Copy size={15} />}
                {copied === 'code' ? 'Code copied' : 'Copy code'}
              </button>
              <button type="button" className="chip" data-active={copied === 'link'} onClick={share}>
                {copied === 'link' ? <Check size={15} /> : <Share2 size={15} />}
                {copied === 'link' ? 'Link copied' : 'Share invite link'}
              </button>
            </div>
          </section>

          {/* Members + Ready Badges */}
          <section className="panel rise mt-6 p-4" style={{ animationDelay: '60ms' }}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Who&apos;s in the room</h2>
              <span className="text-xs font-semibold text-[var(--muted)] tabular">
                {hasQuestions
                  ? `Ready: ${readyCount}/${playerCount}`
                  : `${playerCount} ${playerCount === 1 ? 'player' : 'players'}`}
              </span>
            </div>
            <ul className="mt-4 grid grid-cols-4 gap-x-2 gap-y-4">
              {room.members.map((m, i) => {
                const mReady = Boolean(m.isReady);
                return (
                  <li
                    key={m.id}
                    className="pop relative flex flex-col items-center gap-1.5"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <Avatar
                      emoji={m.avatar}
                      size={52}
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
                    <span className="w-full truncate text-center text-xs font-semibold">
                      {m.id === me?.id ? `${m.name} (You)` : m.name}
                    </span>
                    {hasQuestions ? (
                      <span
                        className="-mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{
                          background: mReady
                            ? 'rgba(215, 255, 63, 0.16)'
                            : 'var(--surface-2)',
                          color: mReady ? 'var(--lime)' : 'var(--muted)',
                        }}
                      >
                        {mReady ? '✅ Ready' : '⏳ Not Ready'}
                      </span>
                    ) : null}
                    {isHost && m.id !== me?.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          haptic(6);
                          void api.removeMember(m.id);
                        }}
                        className="press absolute -top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-3)] text-[var(--muted)] shadow-[0_0_0_1px_var(--line)]"
                        aria-label={`Remove ${m.name}`}
                      >
                        <X size={11} strokeWidth={3} />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {/* Quick Invite Friends row (when signed in with Google and friends exist) */}
            {account && account.friends.length > 0 ? (
              <div className="mt-4 border-t border-[var(--line)] pt-3">
                <p className="mb-2 text-xs font-semibold text-[var(--muted)]">Invite Friends</p>
                <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
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
                        className="chip shrink-0 text-xs"
                        data-active={invited}
                      >
                        <AnimalAvatarArt emoji={f.avatar || '🐥'} size={18} />
                        <span className="max-w-[100px] truncate">@{f.username}</span>
                        {alreadyInRoom ? (
                          <span className="text-[10px] text-[var(--lime)]">In room</span>
                        ) : sending ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : invited ? (
                          <Check size={13} />
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[var(--lime)]">
                            <Send size={11} /> Invite
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : playerCount === 1 ? (
              <p className="mt-3 rounded-xl bg-[var(--ink-2)] px-3 py-2 text-center text-xs text-[var(--muted)] shadow-[0_0_0_1px_var(--line)]">
                Share code <span className="code-cell font-bold text-[var(--paper)]">{room.code}</span> with your friends so they appear here live!
              </p>
            ) : null}
          </section>

          {/* Question Studio Card */}
          <section
            className="panel rise mt-4 p-4"
            style={{
              animationDelay: '100ms',
              boxShadow: !hasQuestions
                ? '0 0 0 1.5px var(--lime), 0 18px 40px -24px rgba(215, 255, 63, 0.35)'
                : undefined,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold leading-tight [text-wrap:balance]">
                  {hasQuestions ? room.title : 'Add Exam Questions'}
                </h2>
                <p className="mt-1 text-xs text-[var(--muted)] tabular">
                  {hasQuestions
                    ? `${room.questions.length} ${
                        room.questions.length === 1 ? 'question' : 'questions'
                      } ready · ${
                        room.timePerQuestion > 0
                          ? `~${Math.max(
                              1,
                              Math.round((room.questions.length * room.timePerQuestion) / 60)
                            )} min`
                          : 'Unlimited time'
                      }`
                    : 'No questions loaded yet — paste Markdown or upload a PDF / screenshot'}
                </p>
              </div>
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{
                  background: hasQuestions ? 'var(--surface-2)' : 'rgba(215, 255, 63, 0.16)',
                  color: 'var(--lime)',
                }}
              >
                {hasQuestions ? <FileText size={18} /> : <FileUp size={18} />}
              </span>
            </div>

            {hasQuestions && room.questions[0] ? (
              <div className="mt-3 rounded-xl bg-[var(--ink-2)] px-3 py-2.5 text-[13px] leading-snug text-[var(--muted)] shadow-[0_0_0_1px_var(--line)]">
                <span className="font-semibold text-[var(--paper)]">Q1. </span>
                <Markdown source={room.questions[0].prompt} inline />
              </div>
            ) : (
              <div className="mt-3 rounded-2xl bg-[var(--ink-2)] p-3 text-xs leading-relaxed text-[var(--muted)] shadow-[0_0_0_1px_var(--line)]">
                <p className="flex items-center gap-1.5 font-semibold text-[var(--paper)]">
                  <Sparkles size={14} className="text-[var(--lime)]" /> Supports Markdown, PDFs, Exam Photos &amp; LaTeX Math
                </p>
                <p className="mt-1">
                  Paste Markdown directly (or copy our AI prompt), or enter your Gemini key to extract questions from PDFs &amp; screenshots.
                </p>
              </div>
            )}

            <button
              type="button"
              className={`mt-3 w-full justify-between ${
                !hasQuestions ? 'btn-primary h-12 text-sm' : 'btn-secondary'
              }`}
              onClick={() => {
                haptic(6);
                setStudioOpen(true);
              }}
            >
              <span className="flex items-center gap-2">
                <FileUp size={17} />
                {hasQuestions
                  ? 'Edit or upload new questions (MD / PDF / Image)'
                  : 'Open Question Studio (MD / PDF / Image)'}
              </span>
              <ChevronRight size={18} className={!hasQuestions ? 'text-[var(--ink)]' : 'text-[var(--muted)]'} />
            </button>
          </section>

          {/* Mode selector + Optional Timer */}
          <section className="rise mt-4" style={{ animationDelay: '150ms' }}>
            <div className="mb-2.5 flex items-baseline justify-between px-1">
              <h2 className="font-display text-lg font-bold">How we play</h2>
              {!isHost ? <span className="text-xs text-[var(--muted)]">Host decides</span> : null}
            </div>
            <div role="radiogroup" aria-label="Game mode" className="grid gap-2.5">
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
                      void api.updateSettings({ mode: m.id });
                    }}
                    className="press relative flex items-start gap-3.5 rounded-[22px] p-4 text-left disabled:cursor-default"
                    style={{
                      background: active ? 'var(--surface-2)' : 'var(--surface)',
                      boxShadow: active
                        ? `0 0 0 2px ${m.color}, 0 16px 30px -20px ${m.color}`
                        : '0 0 0 1px var(--line)',
                      opacity: !isHost && !active ? 0.55 : 1,
                    }}
                  >
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
                      style={{
                        background: active ? m.color : 'var(--surface-3)',
                        color: active ? 'var(--ink)' : m.color,
                      }}
                    >
                      <Icon size={20} strokeWidth={2.4} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-[17px] font-bold">{m.title}</span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-[var(--muted)]">
                        {m.body}
                      </span>
                    </span>
                    <span
                      className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{
                        boxShadow: active ? 'none' : 'inset 0 0 0 2px var(--line-strong)',
                        background: active ? m.color : 'transparent',
                      }}
                    >
                      {active ? <Check size={13} strokeWidth={3.5} className="text-[var(--ink)]" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center gap-2 overflow-x-auto px-1 no-scrollbar">
              <span className="flex shrink-0 items-center gap-1.5 pr-1 text-xs font-semibold text-[var(--muted)]">
                <Timer size={14} /> Timer
              </span>
              {TIMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="chip shrink-0 tabular"
                  data-active={room.timePerQuestion === t}
                  disabled={!isHost}
                  onClick={() => {
                    haptic(5);
                    void api.updateSettings({ timePerQuestion: t });
                  }}
                >
                  {t === 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <InfinityIcon size={13} /> Off
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
      <div className="pb-safe relative z-10 border-t border-[var(--line)] bg-[rgba(14,15,19,0.9)] px-5 pt-3 backdrop-blur">
        {!hasQuestions ? (
          <button
            type="button"
            className="btn-primary h-14 w-full text-base"
            disabled
          >
            Add questions above to start
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 text-xs font-semibold text-[var(--muted)]">
              <span className="tabular">
                Ready: {readyCount} / {playerCount} {playerCount === 1 ? 'player' : 'players'}
              </span>
              <span>
                {allMembersReady
                  ? 'Everyone is ready!'
                  : `Waiting on ${notReadyNames.join(', ')}`}
              </span>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleToggleReady()}
                className={`h-14 flex-1 text-base ${amReady ? 'btn-secondary' : 'btn-primary'}`}
                style={
                  amReady
                    ? {
                        boxShadow: '0 0 0 2px var(--lime), inset 0 -2px 0 rgba(0,0,0,0.35)',
                        color: 'var(--lime)',
                      }
                    : undefined
                }
              >
                {amReady ? <Check size={19} strokeWidth={2.8} /> : <Hand size={19} />}
                {amReady ? 'Ready ✓ (tap to cancel)' : "I'm Ready!"}
              </button>

              {isHost && playerCount === 1 && allMembersReady ? (
                <button
                  type="button"
                  onClick={start}
                  disabled={starting}
                  className="btn-primary h-14 shrink-0 px-5 text-base"
                >
                  {starting ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
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
