'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AtSign,
  Bell,
  Check,
  ClipboardPaste,
  Copy,
  Loader2,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  SlidersHorizontal,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { AVATAR_OPTIONS, type PublicDirectoryUser, type UseRoomReturn } from '@/types/exam';
import { Avatar, copyText, haptic } from './ui';
import RoomLobby from './RoomLobby';
import { InstallAppButton } from './InstallAppSheet';
import { autoName, extractRoomCode, readProfile, saveProfile } from './profile';

const GoogleSignInSheet = dynamic(() => import('./GoogleSignInSheet'), { ssr: false });
const ProfileEditSheet = dynamic(() => import('./ProfileEditSheet'), { ssr: false });
const NotificationsSheet = dynamic(() => import('./NotificationsSheet'), { ssr: false });

export default function LobbyView({
  api,
  inviteCode,
}: {
  api: UseRoomReturn;
  inviteCode: string | null;
}) {
  if (api.room) return <RoomLobby api={api} />;
  return <JoinScreen api={api} inviteCode={inviteCode} />;
}

/* -------------------------------------------------------------------------- */

function JoinScreen({
  api,
  inviteCode,
}: {
  api: UseRoomReturn;
  inviteCode: string | null;
}) {
  const { account } = api;
  const [avatar, setAvatar] = useState<string>(AVATAR_OPTIONS[0]);
  const [name, setName] = useState('');
  const [tab, setTab] = useState<'create' | 'join'>(inviteCode ? 'join' : 'create');
  const [code, setCode] = useState(inviteCode ?? '');
  const [codeFocused, setCodeFocused] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [copiedHandle, setCopiedHandle] = useState(false);

  const [addFriendOpen, setAddFriendOpen] = useState(false);
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
    } else {
      const a = AVATAR_OPTIONS[0];
      setAvatar(a);
      setName(autoName(a));
    }
  }, []);

  useEffect(() => {
    if (account) {
      if (account.name) setName(account.name);
      if (account.avatar) setAvatar(account.avatar);
    }
  }, [account]);

  useEffect(() => {
    if (inviteCode) {
      setCode(inviteCode);
      setTab('join');
    }
  }, [inviteCode]);

  // Live @username autocomplete lookup (only when addFriendOpen is expanded)
  useEffect(() => {
    if (!account || !addFriendOpen) {
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
  }, [friendInput, account, addFriendOpen, api]);

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
      setAddFriendOpen(false);
    }
  };

  const cells = useMemo(() => Array.from({ length: 6 }, (_, i) => code[i] ?? ''), [code]);

  return (
    <div className="scroll-area">
      <div className="pt-safe flex min-h-full flex-col px-4 pb-6">
        {/* Clean Header with App Logo */}
        <header className="flex items-center justify-between gap-2 pt-1.5">
          <div className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="" className="h-8 w-8 rounded-[10px]" />
            <span className="font-display text-lg font-bold tracking-tight">exam room</span>
          </div>

          <div className="flex items-center gap-1.5">
            <InstallAppButton compact />
            {account ? (
              <button
                type="button"
                onClick={() => {
                  haptic(5);
                  setNotifOpen(true);
                }}
                aria-label="Notifications and room invites"
                className="press relative flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--paper)] shadow-[0_0_0_1px_var(--line)]"
              >
                <Bell size={15} />
                {(account.invites?.length ?? 0) > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--lime)] px-1 text-[10px] font-extrabold text-[var(--ink)] tabular">
                    {account.invites.length}
                  </span>
                ) : null}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                haptic(5);
                setProfileOpen(true);
              }}
              aria-label="App layout and profile settings"
              title="Profile & Layout Settings"
              className="press flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--paper)] shadow-[0_0_0_1px_var(--line)]"
            >
              <SlidersHorizontal size={15} />
            </button>
            {account ? (
              <button
                type="button"
                onClick={() => {
                  haptic(6);
                  api.logoutAccount();
                }}
                className="chip !h-9 !min-h-0 max-w-[145px] !px-3 text-xs"
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
                className="chip !h-9 !min-h-0 !px-3 text-xs"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--lime)]" />
                Sign in
              </button>
            )}
          </div>
        </header>

        {/* Invite pill when arriving via ?room=CODE */}
        {inviteCode ? (
          <div className="rise mt-3 flex items-center justify-between rounded-2xl bg-[rgba(215,255,63,0.12)] px-3.5 py-2 text-sm font-semibold text-[var(--lime)] shadow-[0_0_0_1px_rgba(215,255,63,0.3)]">
            <span>Invited to room</span>
            <span className="code-cell font-extrabold tracking-widest">{inviteCode}</span>
          </div>
        ) : null}

        {/* Simple, Comfortable 1-Row Profile Card */}
        <section className="panel rise mt-4 p-3.5" style={{ animationDelay: '40ms' }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  haptic(6);
                  setProfileOpen(true);
                }}
                className="press shrink-0 rounded-full"
                aria-label="Change avatar or edit profile"
              >
                <Avatar emoji={avatar} size={52} ring="me" />
              </button>
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-bold leading-tight">
                  {finalName}
                </p>
                {account ? (
                  <button
                    type="button"
                    onClick={() => void handleCopyUsername()}
                    className="press mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--ink-2)] px-2.5 py-0.5 text-xs font-semibold text-[var(--lime)] shadow-[0_0_0_1px_var(--line)]"
                  >
                    <span>@{account.username}</span>
                    {copiedHandle ? <Check size={11} /> : <Copy size={11} className="text-[var(--muted)]" />}
                  </button>
                ) : (
                  <p className="mt-0.5 text-xs text-[var(--muted)]">Guest player</p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                haptic(6);
                setProfileOpen(true);
              }}
              className="btn-secondary !min-h-[40px] shrink-0 !rounded-xl !px-3.5 text-xs"
            >
              <Pencil size={13} />
              Edit Profile
            </button>
          </div>
        </section>

        {/* Create / Join */}
        <section className="rise mt-4" style={{ animationDelay: '70ms' }}>
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
                  if (t === 'join') setTimeout(() => codeRef.current?.focus(), 200);
                }}
                className="press relative z-10 h-11 rounded-xl text-sm font-semibold"
                style={{ color: tab === t ? 'var(--paper)' : 'var(--muted)' }}
              >
                {t === 'create' ? 'Start a room' : 'Join with code'}
              </button>
            ))}
          </div>

          {tab === 'create' ? (
            <div key="create" className="rise mt-3">
              <button
                type="button"
                className="btn-primary h-[52px] w-full text-base"
                disabled={api.isLoading}
                onClick={() => void go('create')}
              >
                {api.isLoading ? (
                  <Loader2 size={19} className="animate-spin" />
                ) : (
                  <Plus size={19} strokeWidth={2.5} />
                )}
                Create room
              </button>
            </div>
          ) : (
            <div key="join" className="rise mt-3 space-y-3">
              <label className="relative block" htmlFor="room-code">
                <span className="sr-only">Room code</span>
                <div className="grid grid-cols-6 gap-2">
                  {cells.map((c, i) => {
                    const active = codeFocused && (i === code.length || (i === 5 && code.length === 6));
                    return (
                      <div
                        key={i}
                        className="code-cell relative flex h-14 items-center justify-center rounded-2xl text-2xl font-bold transition-all duration-200"
                        style={{
                          background: c ? 'var(--surface-2)' : 'var(--ink-2)',
                          boxShadow: active
                            ? '0 0 0 2px var(--lime), inset 0 2px 4px rgba(0,0,0,0.3)'
                            : c
                            ? 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -2px 0 rgba(0,0,0,0.35), 0 0 0 1px var(--line)'
                            : 'inset 0 2px 4px rgba(0,0,0,0.4), 0 0 0 1px var(--line)',
                        }}
                      >
                        {c ? (
                          <span key={c + i} className="pop">
                            {c}
                          </span>
                        ) : active ? (
                          <span className="caret-blink h-6 w-[2px] rounded bg-[var(--lime)]" />
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

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void handlePasteCode()}
                  className="chip !h-8 !min-h-0 !px-3 text-xs"
                  data-active={pasteFeedback === 'ok'}
                >
                  {pasteFeedback === 'ok' ? <Check size={13} /> : <ClipboardPaste size={13} />}
                  {pasteFeedback === 'ok'
                    ? 'Code pasted!'
                    : pasteFeedback === 'none'
                    ? 'No code in clipboard'
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
                className="btn-primary h-[52px] w-full text-base"
                disabled={!codeReady || api.isLoading}
                onClick={() => void go('join')}
              >
                {api.isLoading ? (
                  <Loader2 size={19} className="animate-spin" />
                ) : (
                  <LogIn size={19} strokeWidth={2.5} />
                )}
                {codeReady ? `Join ${code}` : 'Enter 6-character code'}
              </button>
            </div>
          )}
        </section>

        {/* Friends Section */}
        <section className="panel rise mt-4 p-3.5" style={{ animationDelay: '100ms' }}>
          {account ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-[var(--lime)]" />
                  <span className="font-display text-base font-bold">
                    Friends ({account.friends.length})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    haptic(5);
                    setAddFriendOpen((v) => !v);
                  }}
                  className="chip !h-8 !min-h-0 !px-3 text-xs"
                  data-active={addFriendOpen}
                >
                  {addFriendOpen ? <X size={13} /> : <UserPlus size={13} />}
                  {addFriendOpen ? 'Close' : 'Add Friend'}
                </button>
              </div>

              {addFriendOpen ? (
                <div className="rise mt-2.5 space-y-2">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleAddFriend(friendInput);
                    }}
                    className="flex gap-2"
                  >
                    <div className="relative flex-1">
                      <AtSign
                        size={14}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                      />
                      <input
                        type="text"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={friendInput}
                        onChange={(e) => setFriendInput(e.target.value)}
                        placeholder="username"
                        className="field !min-h-[42px] pl-8 text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!friendInput.trim() || addingFriend}
                      className="btn-secondary !min-h-[42px] shrink-0 !rounded-xl !px-3.5 text-xs"
                    >
                      {addingFriend ? <Loader2 size={14} className="animate-spin" /> : 'Add'}
                    </button>
                  </form>

                  {suggestions.length > 0 ? (
                    <div className="space-y-1 rounded-xl bg-[var(--ink-2)] p-1.5 shadow-[0_0_0_1px_var(--line)]">
                      {suggestions.slice(0, 3).map((u) => (
                        <button
                          key={u.username}
                          type="button"
                          onClick={() => void handleAddFriend(u.username)}
                          className="press flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/5"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Avatar emoji={u.avatar || '🐥'} size={26} />
                            <span className="truncate text-xs font-bold">{u.name}</span>
                            <span className="truncate text-xs text-[var(--lime)]">
                              @{u.username}
                            </span>
                          </span>
                          <span className="chip !h-6 !min-h-0 !px-2 text-[11px]">+ Add</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {account.friends.length > 0 ? (
                <div className="no-scrollbar -mx-3.5 mt-2.5 flex gap-2 overflow-x-auto px-3.5 pb-0.5">
                  {account.friends.map((f) => (
                    <span
                      key={f.username}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--ink-2)] py-1 pl-1.5 pr-2.5 text-xs shadow-[0_0_0_1px_var(--line)]"
                    >
                      <Avatar emoji={f.avatar || '🐥'} size={24} />
                      <span className="font-semibold text-[var(--paper)]">@{f.username}</span>
                      <button
                        type="button"
                        onClick={() => {
                          haptic(5);
                          void api.removeFriendByUsername(f.username);
                        }}
                        className="press rounded-full p-0.5 text-[var(--muted)] hover:text-[var(--coral)]"
                        aria-label={`Remove @${f.username}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : !addFriendOpen ? (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Tap <strong className="text-[var(--paper)]">Add Friend</strong> to invite friends in 1 tap.
                </p>
              ) : null}
            </>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs text-[var(--muted)]">
                Want to add friends by <strong className="text-[var(--paper)]">@username</strong>?
              </span>
              <button
                type="button"
                onClick={() => {
                  haptic(6);
                  setSignInOpen(true);
                }}
                className="chip !h-8 !min-h-0 shrink-0 !px-3 text-xs font-semibold text-[var(--lime)]"
              >
                Sign in
              </button>
            </div>
          )}
        </section>

        <p className="mt-auto pt-5 text-center text-xs text-[var(--faint)]">
          Swipe down to refresh · Rooms expire after 4 quiet hours
        </p>
      </div>

      <GoogleSignInSheet
        open={signInOpen}
        onClose={() => setSignInOpen(false)}
        api={api}
        currentAvatar={avatar}
      />
      <NotificationsSheet
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        api={api}
      />
      <ProfileEditSheet
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        api={api}
        initialName={name}
        initialAvatar={avatar}
        onSaved={({ name: nextName, avatar: nextAvatar }) => {
          setName(nextName);
          setAvatar(nextAvatar);
        }}
      />
    </div>
  );
}
