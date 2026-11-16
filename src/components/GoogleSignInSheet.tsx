'use client';

import { useEffect, useState } from 'react';
import { AtSign, Loader2, Mail, ShieldCheck, User } from 'lucide-react';
import type { UseRoomReturn } from '@/types/exam';
import { readProfile } from './profile';
import { Sheet, haptic } from './ui';

function suggestHandle(email: string, name: string): string {
  const source = email.includes('@') ? email.split('@')[0] : name;
  return source
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, 20);
}

function suggestName(email: string): string {
  const prefix = email.split('@')[0] ?? '';
  const cleaned = prefix.replace(/[._-]+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .slice(0, 18);
}

export default function GoogleSignInSheet({
  open,
  onClose,
  api,
  currentAvatar,
}: {
  open: boolean;
  onClose: () => void;
  api: UseRoomReturn;
  currentAvatar: string;
}) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    const localProf = readProfile();
    if (localProf?.name && !nameEdited) {
      setDisplayName(localProf.name);
    }
  }, [open, nameEdited]);

  const handleEmailChange = (val: string) => {
    setEmail(val);
    setLocalError(null);
    if (!usernameEdited) {
      setUsername(suggestHandle(val, displayName));
    }
    if (!nameEdited && val.includes('@')) {
      const guessed = suggestName(val);
      if (guessed) setDisplayName(guessed);
    }
  };

  const cleanEmail = email.trim().toLowerCase();
  const cleanHandle = username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20);
  const resolvedHandle = cleanHandle || suggestHandle(cleanEmail, displayName);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailValid) {
      setLocalError('Please enter a valid Google email (e.g. you@gmail.com).');
      return;
    }
    if (resolvedHandle.length > 0 && resolvedHandle.length < 3) {
      setLocalError('Username must be at least 3 characters (or leave blank to auto-generate).');
      return;
    }

    setLocalError(null);
    setSubmitting(true);
    haptic([8, 25, 8]);

    const resolvedName =
      displayName.trim() || suggestName(cleanEmail) || resolvedHandle || 'Player';

    const acc = await api.loginWithGoogle({
      email: cleanEmail,
      name: resolvedName,
      username: resolvedHandle || undefined,
      avatar: currentAvatar,
    });
    setSubmitting(false);

    if (acc) {
      haptic([10, 35, 10]);
      onClose();
    } else if (api.error) {
      setLocalError(api.error);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Sign in with Google">
      <form onSubmit={handleSubmit} className="space-y-4 pb-2">
        <div className="flex items-start gap-3 rounded-2xl bg-[var(--surface)] p-3.5 shadow-[0_0_0_1px_var(--line)]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(215,255,63,0.16)] text-[var(--lime)]">
            <ShieldCheck size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold">Instant Google Account</p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">
              Claim your unique <strong className="text-[var(--paper)]">@username</strong>, add
              friends, and send live 1-tap room invites across phones.
            </p>
          </div>
        </div>

        {/* Google Email */}
        <div>
          <label htmlFor="google-email" className="label flex items-center gap-1.5">
            <Mail size={12} /> Google Email
          </label>
          <input
            id="google-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            className="field mt-1.5 font-medium"
            placeholder="you@gmail.com"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
          />
        </div>

        {/* Unique @username */}
        <div>
          <label htmlFor="google-username" className="label flex items-center gap-1.5">
            <AtSign size={12} /> Unique @username
          </label>
          <div className="relative mt-1.5">
            <AtSign
              size={15}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            />
            <input
              id="google-username"
              type="text"
              autoComplete="username"
              className="field code-cell pl-9 font-semibold"
              placeholder={suggestHandle(cleanEmail, displayName) || 'your_username'}
              value={username}
              onChange={(e) => {
                setUsernameEdited(true);
                setUsername(
                  e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20)
                );
              }}
            />
          </div>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Auto-suggested from your email or name if left blank.
          </p>
        </div>

        {/* Display Name */}
        <div>
          <label htmlFor="google-display-name" className="label flex items-center gap-1.5">
            <User size={12} /> Display Name
          </label>
          <input
            id="google-display-name"
            type="text"
            autoComplete="name"
            maxLength={18}
            className="field mt-1.5 font-semibold"
            placeholder={suggestName(cleanEmail) || 'Your name'}
            value={displayName}
            onChange={(e) => {
              setNameEdited(true);
              setDisplayName(e.target.value);
            }}
          />
        </div>

        {localError ? (
          <p className="text-xs font-semibold text-[var(--coral)]" role="alert">
            {localError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting || !email.trim()}
          className="press flex h-13 w-full items-center justify-center gap-3 rounded-full bg-white px-5 text-[15px] font-semibold text-[#1f1f1f] shadow-md disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 size={18} className="animate-spin text-[#1f1f1f]" />
          ) : (
            <GoogleGIcon />
          )}
          <span>{submitting ? 'Signing you in…' : 'Continue with Google Account'}</span>
        </button>

        <button type="button" onClick={onClose} className="btn-ghost w-full text-sm">
          Continue as Guest
        </button>
      </form>
    </Sheet>
  );
}

function GoogleGIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}
