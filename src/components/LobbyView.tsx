'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Bot, Dices, Loader2, LogIn, Plus, RotateCcw } from 'lucide-react';
import { AVATAR_OPTIONS, type UseRoomReturn } from '@/types/exam';
import { Avatar, Toggle, haptic } from './ui';
import RoomLobby from './RoomLobby';

const PROFILE_KEY = 'exam_room_profile_v1';

const ANIMAL_NAMES: Record<string, string> = {
  '🦊': 'Fox',
  '🐼': 'Panda',
  '🦁': 'Lion',
  '🐸': 'Frog',
  '🦉': 'Owl',
  '🐙': 'Octo',
  '🦄': 'Unicorn',
  '🐯': 'Tiger',
  '🐨': 'Koala',
  '🦖': 'Rex',
  '🐝': 'Bee',
  '🐧': 'Pingu',
  '🦋': 'Flutter',
  '🐬': 'Dolphin',
  '🐺': 'Wolf',
  '🐱': 'Cat',
};
const ADJECTIVES = ['Swift', 'Clever', 'Lucky', 'Bold', 'Sneaky', 'Sharp', 'Calm', 'Turbo', 'Witty', 'Brave'];

function autoName(avatar: string) {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  return `${adj} ${ANIMAL_NAMES[avatar] ?? 'Owl'}`;
}

interface Profile {
  name: string;
  avatar: string;
  custom: boolean;
}

function readProfile(): Profile | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

function saveProfile(p: Profile) {
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

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
  const [avatar, setAvatar] = useState<string>(AVATAR_OPTIONS[0]);
  const [name, setName] = useState('');
  const [custom, setCustom] = useState(false);
  const [tab, setTab] = useState<'create' | 'join'>(inviteCode ? 'join' : 'create');
  const [code, setCode] = useState(inviteCode ?? '');
  const [withBots, setWithBots] = useState(true);
  const [avatarSpin, setAvatarSpin] = useState(0);
  const [codeFocused, setCodeFocused] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const p = readProfile();
    if (p) {
      setAvatar(p.avatar);
      setName(p.name);
      setCustom(p.custom);
    } else {
      const a = AVATAR_OPTIONS[Math.floor(Math.random() * AVATAR_OPTIONS.length)];
      setAvatar(a);
      setName(autoName(a));
    }
  }, []);

  useEffect(() => {
    if (inviteCode) {
      setCode(inviteCode);
      setTab('join');
    }
  }, [inviteCode]);

  const pickAvatar = (a: string) => {
    haptic(6);
    setAvatar(a);
    setAvatarSpin((n) => n + 1);
    if (!custom) setName(autoName(a));
  };

  const shuffle = () => {
    const pool = AVATAR_OPTIONS.filter((a) => a !== avatar);
    pickAvatar(pool[Math.floor(Math.random() * pool.length)]);
  };

  const finalName = name.trim() || autoName(avatar);
  const codeReady = code.length === 6;

  const go = async (mode: 'create' | 'join', overrideCode?: string) => {
    haptic([10, 30, 10]);
    saveProfile({ name: finalName, avatar, custom });
    if (mode === 'create') {
      await api.createRoom({ name: finalName, avatar, withBots });
    } else {
      await api.joinRoom({ code: overrideCode ?? code, name: finalName, avatar });
    }
  };

  const cells = useMemo(() => Array.from({ length: 6 }, (_, i) => code[i] ?? ''), [code]);

  return (
    <div className="scroll-area">
      <div className="pt-safe flex min-h-full flex-col px-5 pb-8">
        {/* Wordmark */}
        <header className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--lime)] font-display text-lg font-extrabold text-[var(--ink)] shadow-[inset_0_-2px_0_rgba(0,0,0,0.2)]">
              e
            </span>
            <span className="font-display text-[17px] font-bold">exam room</span>
          </div>
          <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--muted)]">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--lime)]" />
            live multiplayer
          </span>
        </header>

        {/* Headline */}
        <section className="rise mt-9">
          <h1 className="font-display text-[40px] font-extrabold leading-[0.98] tracking-[-0.035em] [text-wrap:balance]">
            {inviteCode ? (
              <>
                You&apos;re invited to <span className="highlight-text" style={{ backgroundSize: '100% 46%' }}>room {inviteCode}</span>
              </>
            ) : (
              <>
                Take the exam <span className="highlight-text" style={{ backgroundSize: '100% 46%' }}>together.</span>
              </>
            )}
          </h1>
          <p className="mt-3 max-w-[32ch] text-[15px] leading-relaxed text-[var(--muted)]">
            One code, everyone&apos;s phone. See who picked what, react in real time, and settle it on the podium.
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
        <section className="panel rise mt-6 p-4" style={{ animationDelay: '60ms' }}>
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
                Your name in the room
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
        <section className="rise mt-4" style={{ animationDelay: '120ms' }}>
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
              <div className="flex items-center gap-3 rounded-2xl bg-[var(--surface)] px-4 py-3 shadow-[0_0_0_1px_var(--line)]">
                <Bot size={20} className="shrink-0 text-[var(--peri)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Bring practice bots</p>
                  <p className="text-xs text-[var(--muted)]">Two bot friends answer and react, so you can try it solo.</p>
                </div>
                <Toggle checked={withBots} onChange={setWithBots} label="Bring practice bots" />
              </div>
              <button
                type="button"
                className="btn-primary h-14 w-full text-base"
                disabled={api.isLoading}
                onClick={() => void go('create')}
              >
                {api.isLoading ? <Loader2 size={20} className="animate-spin" /> : <Plus size={20} strokeWidth={2.5} />}
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
                    const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
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
                  maxLength={6}
                  className="absolute inset-0 h-full w-full cursor-text opacity-0"
                  aria-label="6-character room code"
                />
              </label>
              <button
                type="button"
                className="btn-primary h-14 w-full text-base"
                disabled={!codeReady || api.isLoading}
                onClick={() => void go('join')}
              >
                {api.isLoading ? <Loader2 size={20} className="animate-spin" /> : <LogIn size={20} strokeWidth={2.5} />}
                {codeReady ? `Join ${code}` : 'Enter the 6-character code'}
              </button>
            </div>
          )}
        </section>

        <p className="mt-auto pt-8 text-center text-xs text-[var(--faint)]">
          No accounts. Rooms clear themselves after 4 quiet hours.
        </p>
      </div>
    </div>
  );
}
