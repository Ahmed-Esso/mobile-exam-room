'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  AtSign,
  Check,
  ClipboardPaste,
  Copy,
  Dices,
  Loader2,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { AVATAR_OPTIONS, type PublicDirectoryUser, type UseRoomReturn } from '@/types/exam';
import { Avatar, copyText, haptic } from './ui';
import RoomLobby from './RoomLobby';
import GoogleSignInSheet from './GoogleSignInSheet';
import { InstallAppButton } from './InstallAppSheet';
import { ANIMAL_NAMES, autoName, extractRoomCode, readProfile, saveProfile } from './profile';

export default function LobbyView({
  api,
  inviteCode,
  rejoinCode,
}: {
  api: UseRoomReturn;
  inviteCode: string | null;
  rejoinCode: string | null;
}) {
  if (api.room) return <RoomLobby api={api} />;
  return <JoinScreen api={api} inviteCode={inviteCode} rejoinCode={rejoinCode} />;
}

/* -------------------------------------------------------------------------- */

function JoinScreen({
  api,
  inviteCode,
  rejoinCode,
}: {
  api: UseRoomReturn;
  inviteCode: string | null;
  rejoinCode: string | null;
}) {
  const { account } = api;
  const [avatar, setAvatar] = useState<string>(AVATAR_OPTIONS[0]); // 🐥 by default
  const [name, setName] = useState('');
  const [custom, setCustom] = useState(false);
  const [tab, setTab] = useState<'create' | 'join'>(inviteCode ? 'join' : 'create');
  const [code, setCode] = useState(inviteCode ?? '');
  const [avatarSpin, setAvatarSpin] = useState(0);
  const [codeFocused, setCodeFocused] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);

  // @username editing + friend lookup
  const [editingHandle, setEditingHandle] = useState(false);
  const [handleInput, setHandleInput] = useState('');
  const [savingHandle, setSavingHandle] = useState(false);
  const [copiedHandle, setCopiedHandle] = useState(false);

  const [friendInput, setFriendInput] = useState('');
  const [addingFriend, setAddingFriend] = useState(false);
  const [suggestions, setSuggestions] = useState<PublicDirectoryUser[]>([]);
  const [pasteFeedback, setPasteFeedback] = useState<'ok' | 'none' | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const p = readProfile();
    if (p) {
      setAvatar(p.avatar);
      setName(p.name);
      setCustom(p.custom);
    } else {
      const a = AVATAR_OPTIONS[0]; // 🐥
      setAvatar(a);
      setName(autoName(a));
    }
  }, []);

  useEffect(() => {
    if (account) {
      if (account.name) {
        setName(account.name);
        setCustom(true);
      }
      if (account.avatar) setAvatar(account.avatar);
      setHandleInput(account.username);
    }
  }, [account]);

  useEffect(() => {
    if (inviteCode) {
      setCode(inviteCode);
      setTab('join');
    }
  }, [inviteCode]);

  // Live @username autocomplete lookup
  useEffect(() => {
    if (!account) {
      setSuggestions([]);
      return;
    }
    const q = friendInput.trim().replace(/^@+/, '').toLowerCase();
    if (!q) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const list = await api.searchUsersByUsername(q);
      if (!cancelled) {
        setSuggestions(
          list.filter(
            (u) =>
              u.username !== account.username &&
              !account.friends.some((f) => f.username === u.username)
          )
        );
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [friendInput, account, api]);

  const pickAvatar = (a: string) => {
    haptic(6);
    setAvatar(a);
    setAvatarSpin((n) => n + 1);
    if (!custom && !account) setName(autoName(a));
  };

  const shuffle = () => {
    const pool = AVATAR_OPTIONS.filter((a) => a !== avatar);
    pickAvatar(pool[Math.floor(Math.random() * pool.length)]);
  };

  const finalName = name.trim() || account?.name || autoName(avatar);
  const codeReady = code.length === 6;

  const go = async (mode: 'create' | 'join', overrideCode?: string) => {
    haptic([10, 30, 10]);
    saveProfile({ name: finalName, avatar, custom: true });
    if (mode === 'create') {
      await api.createRoom({ name: finalName, avatar });
    } else {
      await api.joinRoom({ code: overrideCode ?? code, name: finalName, avatar });
    }
  };

  const handlePasteCode = async () => {
    haptic(8);
    try {
      const raw = await navigator.clipboard.readText();
      const extracted = extractRoomCode(raw);
      if (extracted) {
        setCode(extracted);
        setPasteFeedback('ok');
        window.setTimeout(() => setPasteFeedback(null), 1600);
        return;
      }
    } catch {
      /* clipboard permission denied or empty */
    }
    setPasteFeedback('none');
    codeRef.current?.focus();
    window.setTimeout(() => setPasteFeedback(null), 1800);
  };

  const handleCopyUsername = async () => {
    if (!account) return;
    if (await copyText(`@${account.username}`)) {
      haptic([6, 30, 6]);
      setCopiedHandle(true);
      window.setTimeout(() => setCopiedHandle(false), 1600);
    }
  };

  const handleSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = handleInput.trim().replace(/^@+/, '').toLowerCase();
    if (!cleaned) return;
    setSavingHandle(true);
    haptic(8);
    const ok = await api.updateUsername(cleaned);
    setSavingHandle(false);
    if (ok) setEditingHandle(false);
  };

  const handleAddFriend = async (usernameToAdd: string) => {
    const cleaned = usernameToAdd.trim().replace(/^@+/, '').toLowerCase();
    if (!cleaned) return;
    setAddingFriend(true);
    haptic(8);
    const ok = await api.addFriendByUsername(cleaned);
    setAddingFriend(false);
    if (ok) {
      setFriendInput('');
      setSuggestions([]);
    }
  };

  const cells = useMemo(() => Array.from({ length: 6 }, (_, i) => code[i] ?? ''), [code]);

  return (
    <div className="scroll-area">
      <div className="pt-safe flex min-h-full flex-col px-5 pb-8">
        {/* Wordmark + Install + Account Switcher */}
        <header className="flex items-center justify-between gap-2 pt-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--lime)] font-display text-lg font-extrabold text-[var(--ink)] shadow-[inset_0_-2px_0_rgba(0,0,0,0.2)]">
              e
            </span>
            <span className="font-display text-[17px] font-bold">exam room</span>
          </div>

          <div className="flex items-center gap-1.5">
            <InstallAppButton compact />
            {account ? (
              <button
                type="button"
                onClick={() => {
                  haptic(6);
                  api.logoutAccount();
                }}
                className="chip h-9 min-h-0 max-w-[160px] px-3 text-xs"
                title={`Signed in as @${account.username} (${account.email}). Tap to sign out.`}
              >
                <span className="truncate font-semibold text-[var(--lime)]">@{account.username}</span>
                <LogOut size={13} className="shrink-0 text-[var(--muted)]" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  haptic(6);
                  setSignInOpen(true);
                }}
                className="chip h-9 min-h-0 px-3 text-xs"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--lime)]" />
                Sign in
              </button>
            )}
          </div>
        </header>

        {/* Headline */}
        <section className="rise mt-8">
          <h1 className="font-display text-[38px] font-extrabold leading-[0.98] tracking-[-0.035em] [text-wrap:balance]">
            {inviteCode ? (
              <>
                You&apos;re invited to{' '}
                <span className="highlight-text" style={{ backgroundSize: '100% 46%' }}>
                  room {inviteCode}
                </span>
              </>
            ) : (
              <>
                Take the exam{' '}
                <span className="highlight-text" style={{ backgroundSize: '100% 46%' }}>
                  together.
                </span>
              </>
            )}
          </h1>
          <p className="mt-3 max-w-[33ch] text-[15px] leading-relaxed text-[var(--muted)]">
            {account
              ? `Verified as @${account.username}. Share your handle so friends can add you and send 1-tap room invites.`
              : 'Play right away as a guest, or sign in with Google to claim your @username and add friends.'}
          </p>
        </section>

        {rejoinCode && !inviteCode ? (
          <button
            type="button"
            onClick={() => {
              setCode(rejoinCode);
              void go('join', rejoinCode);
            }}
            className="press rise mt-5 flex items-center gap-3 rounded-2xl bg-[var(--surface)] px-4 py-3 text-left shadow-[0_0_0_1px_var(--line)]"
          >
            <RotateCcw size={18} className="text-[var(--lime)]" />
            <span className="flex-1 text-sm">
              Jump back into <span className="code-cell font-bold tracking-wider">{rejoinCode}</span>
            </span>
            <ArrowRight size={16} className="text-[var(--muted)]" />
          </button>
        ) : null}

        {/* Profile */}
        <section className="panel rise mt-5 p-4" style={{ animationDelay: '60ms' }}>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={shuffle}
              className="press relative"
              aria-label="Shuffle avatar"
            >
              <span key={avatarSpin} className="pop block">
                <Avatar emoji={avatar} size={72} ring="me" />
              </span>
              <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--paper)] text-[var(--ink)] shadow-md">
                <Dices size={15} />
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <label htmlFor="nickname" className="label">
                {account ? 'Account display name' : 'Guest nickname'}
              </label>
              <input
                id="nickname"
                className="field mt-1.5 font-semibold"
                value={name}
                maxLength={18}
                autoComplete="nickname"
                placeholder="Nickname"
                onChange={(e) => {
                  setName(e.target.value);
                  setCustom(true);
                }}
              />
            </div>
          </div>

          {/* @username pill when signed in with Google */}
          {account ? (
            <div className="mt-3 rounded-2xl bg-[var(--ink-2)] p-3 shadow-[0_0_0_1px_var(--line)]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5 text-xs">
                  <ShieldCheck size={14} className="shrink-0 text-[var(--lime)]" />
                  <span className="font-bold text-[var(--paper)]">@{account.username}</span>
                  <span className="truncate text-[var(--faint)]">· {account.email}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void handleCopyUsername()}
                    className="chip !h-7 !min-h-0 !px-2.5 text-[11px]"
                    data-active={copiedHandle}
                  >
                    {copiedHandle ? <Check size={12} /> : <Copy size={12} />}
                    {copiedHandle ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHandleInput(account.username);
                      setEditingHandle((v) => !v);
                    }}
                    className="chip !h-7 !min-h-0 !px-2 text-[11px]"
                    aria-label="Edit username"
                  >
                    <Pencil size={12} />
                  </button>
                </div>
              </div>

              {editingHandle ? (
                <form onSubmit={handleSaveUsername} className="mt-2.5 flex gap-2">
                  <div className="relative flex-1">
                    <AtSign
                      size={14}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                    />
                    <input
                      type="text"
                      value={handleInput}
                      onChange={(e) =>
                        setHandleInput(
                          e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20)
                        )
                      }
                      placeholder="new_username"
                      className="field code-cell !min-h-[40px] pl-8 text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingHandle || handleInput.trim().length < 3}
                    className="btn-primary !min-h-[40px] shrink-0 !rounded-xl !px-3 text-xs"
                  >
                    {savingHandle ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}

          <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {AVATAR_OPTIONS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => pickAvatar(a)}
                aria-label={`Avatar ${ANIMAL_NAMES[a] ?? a}`}
                aria-pressed={a === avatar}
                className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-[22px]"
                style={{
                  background: a === avatar ? 'var(--paper)' : 'var(--surface-2)',
                  boxShadow: a === avatar ? 'none' : '0 0 0 1px var(--line)',
                  transform: a === avatar ? 'translateY(-2px)' : undefined,
                }}
              >
                {a}
              </button>
            ))}
          </div>
        </section>

        {/* Create / Join */}
        <section className="rise mt-4" style={{ animationDelay: '100ms' }}>
          <div className="relative grid grid-cols-2 rounded-2xl bg-[var(--ink-2)] p-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4),0_0_0_1px_var(--line)]">
            <span
              aria-hidden
              className="absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-xl bg-[var(--surface-3)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-transform duration-300"
              style={{
                transform: tab === 'join' ? 'translateX(calc(100% + 0px))' : 'translateX(0)',
                left: 4,
                transitionTimingFunction: 'var(--ease-out)',
              }}
            />
            {(['create', 'join'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  haptic(5);
                  setTab(t);
                  if (t === 'join') setTimeout(() => codeRef.current?.focus(), 250);
                }}
                className="press relative z-10 h-11 rounded-xl text-sm font-semibold"
                style={{ color: tab === t ? 'var(--paper)' : 'var(--muted)' }}
              >
                {t === 'create' ? 'Start a room' : 'Join with code'}
              </button>
            ))}
          </div>

          {tab === 'create' ? (
            <div key="create" className="rise mt-4 space-y-3">
              <button
                type="button"
                className="btn-primary h-14 w-full text-base"
                disabled={api.isLoading}
                onClick={() => void go('create')}
              >
                {api.isLoading ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Plus size={20} strokeWidth={2.5} />
                )}
                Create room
              </button>
            </div>
          ) : (
            <div key="join" className="rise mt-4 space-y-3">
              <label className="relative block" htmlFor="room-code">
                <span className="sr-only">Room code</span>
                <div className="grid grid-cols-6 gap-2">
                  {cells.map((c, i) => {
                    const active = codeFocused && (i === code.length || (i === 5 && code.length === 6));
                    return (
                      <div
                        key={i}
                        className="code-cell relative flex h-[62px] items-center justify-center rounded-2xl text-[26px] font-bold transition-all duration-200"
                        style={{
                          background: c ? 'var(--surface-2)' : 'var(--ink-2)',
                          boxShadow: active
                            ? '0 0 0 2px var(--lime), inset 0 2px 4px rgba(0,0,0,0.3)'
                            : c
                            ? 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -3px 0 rgba(0,0,0,0.35), 0 0 0 1px var(--line)'
                            : 'inset 0 2px 4px rgba(0,0,0,0.4), 0 0 0 1px var(--line)',
                        }}
                      >
                        {c ? (
                          <span key={c + i} className="pop">
                            {c}
                          </span>
                        ) : active ? (
                          <span className="caret-blink h-7 w-[2px] rounded bg-[var(--lime)]" />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <input
                  id="room-code"
                  ref={codeRef}
                  value={code}
                  onFocus={() => setCodeFocused(true)}
                  onBlur={() => setCodeFocused(false)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const extracted = extractRoomCode(raw);
                    const v =
                      extracted ||
                      raw
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, '')
                        .slice(0, 6);
                    if (v.length !== code.length) haptic(4);
                    setCode(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && code.length === 6) void go('join');
                  }}
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={64}
                  className="absolute inset-0 h-full w-full cursor-text opacity-0"
                  aria-label="6-character room code"
                />
              </label>

              {/* 1-Tap Paste Code button */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void handlePasteCode()}
                  className="chip text-xs"
                  data-active={pasteFeedback === 'ok'}
                >
                  {pasteFeedback === 'ok' ? <Check size={14} /> : <ClipboardPaste size={14} />}
                  {pasteFeedback === 'ok'
                    ? 'Code pasted!'
                    : pasteFeedback === 'none'
                    ? 'No 6-char code in clipboard'
                    : 'Paste Code'}
                </button>
                {code.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCode('');
                      codeRef.current?.focus();
                    }}
                    className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--paper)]"
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                className="btn-primary h-14 w-full text-base"
                disabled={!codeReady || api.isLoading}
                onClick={() => void go('join')}
              >
                {api.isLoading ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <LogIn size={20} strokeWidth={2.5} />
                )}
                {codeReady ? `Join ${code}` : 'Enter the 6-character code'}
              </button>
            </div>
          )}
        </section>

        {/* Friends Section (Signed in with Google) or Sign-In Prompt */}
        <section className="panel rise mt-5 p-4" style={{ animationDelay: '140ms' }}>
          {account ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users size={17} className="text-[var(--lime)]" />
                  <h2 className="font-display text-base font-bold">Friends</h2>
                </div>
                <span className="text-xs text-[var(--muted)] tabular">
                  {account.friends.length} {account.friends.length === 1 ? 'friend' : 'friends'}
                </span>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleAddFriend(friendInput);
                }}
                className="mt-3 flex gap-2"
              >
                <div className="relative flex-1">
                  <AtSign
                    size={15}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                  />
                  <input
                    type="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={friendInput}
                    onChange={(e) => setFriendInput(e.target.value)}
                    placeholder="username (e.g. omar)"
                    className="field !min-h-[44px] pl-9 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!friendInput.trim() || addingFriend}
                  className="btn-secondary !min-h-[44px] shrink-0 !px-3.5 text-xs"
                >
                  {addingFriend ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <UserPlus size={15} />
                  )}
                  Add
                </button>
              </form>

              {/* Live @username search suggestions */}
              {suggestions.length > 0 ? (
                <div className="mt-2 space-y-1 rounded-2xl bg-[var(--ink-2)] p-2 shadow-[0_0_0_1px_var(--line)]">
                  <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                    Matching users
                  </p>
                  {suggestions.slice(0, 4).map((u) => (
                    <button
                      key={u.username}
                      type="button"
                      onClick={() => void handleAddFriend(u.username)}
                      className="press flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-white/5"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="text-lg">{u.avatar || '🐥'}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-bold">{u.name}</span>
                          <span className="block truncate text-[11px] text-[var(--lime)]">
                            @{u.username}
                          </span>
                        </span>
                      </span>
                      <span className="chip !h-7 !min-h-0 !px-2.5 text-[11px]">+ Add</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {account.friends.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {account.friends.map((f) => (
                    <li
                      key={f.username}
                      className="flex items-center justify-between gap-2.5 rounded-2xl bg-[var(--ink-2)] px-3 py-2 shadow-[0_0_0_1px_var(--line)]"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar emoji={f.avatar || '🐥'} size={34} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{f.name}</p>
                          <p className="truncate text-[11px] font-semibold text-[var(--lime)]">
                            @{f.username}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          haptic(5);
                          void api.removeFriendByUsername(f.username);
                        }}
                        className="press rounded-full p-1.5 text-[var(--muted)] hover:text-[var(--coral)]"
                        aria-label={`Remove @${f.username}`}
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-[var(--muted)]">
                  Add friends by their <strong className="text-[var(--paper)]">@username</strong> to invite them to any room in 1 tap.
                </p>
              )}
            </>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold">Friends &amp; 1-Tap Room Invites</p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  Sign in with Google to get your @username, add friends, and receive live invites.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  haptic(6);
                  setSignInOpen(true);
                }}
                className="btn-secondary !min-h-[40px] shrink-0 !px-3.5 text-xs"
              >
                Google Sign-In
              </button>
            </div>
          )}
        </section>

        <p className="mt-auto pt-8 text-center text-xs text-[var(--faint)]">
          Swipe down anytime to refresh · Rooms clear after 4 quiet hours.
        </p>
      </div>

      <GoogleSignInSheet
        open={signInOpen}
        onClose={() => setSignInOpen(false)}
        api={api}
        currentAvatar={avatar}
      />
    </div>
  );
}
