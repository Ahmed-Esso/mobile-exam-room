'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import type { UseRoomReturn } from '@/types/exam';
import { Sheet, haptic } from './ui';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (cfg: {
            client_id: string;
            callback: (res: { credential?: string }) => void;
          }) => void;
          renderButton: (
            el: HTMLElement,
            opts: { theme?: string; size?: string; width?: number; shape?: string; text?: string }
          ) => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

export default function GoogleSignInSheet({
  open,
  onClose,
  api,
  currentName,
  currentAvatar,
}: {
  open: boolean;
  onClose: () => void;
  api: UseRoomReturn;
  currentName: string;
  currentAvatar: string;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState(currentName);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const gisBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    setName((prev) => prev || currentName);
  }, [open, currentName]);

  // Official Google Identity Services button when NEXT_PUBLIC_GOOGLE_CLIENT_ID is configured
  useEffect(() => {
    if (!open || !GOOGLE_CLIENT_ID || typeof window === 'undefined') return;
    let cancelled = false;

    const mountGis = () => {
      if (cancelled || !gisBtnRef.current || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          if (!response.credential) return;
          setSubmitting(true);
          const acc = await api.loginWithGoogle({
            email: '',
            name: name.trim() || currentName,
            avatar: currentAvatar,
            googleCredential: response.credential,
          });
          setSubmitting(false);
          if (acc) onClose();
        },
      });
      gisBtnRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(gisBtnRef.current, {
        theme: 'filled_black',
        size: 'large',
        width: 340,
        shape: 'pill',
        text: 'continue_with',
      });
    };

    if (window.google?.accounts?.id) {
      mountGis();
      return () => {
        cancelled = true;
      };
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = mountGis;
    document.head.appendChild(script);
    return () => {
      cancelled = true;
    };
  }, [open, api, currentAvatar, currentName, name, onClose]);

  const submitEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = email.trim().toLowerCase();
    if (!cleaned || !cleaned.includes('@') || !cleaned.includes('.')) {
      setLocalError('Enter your Google email address (e.g. name@gmail.com).');
      return;
    }
    setLocalError(null);
    setSubmitting(true);
    haptic([8, 30, 8]);
    const acc = await api.loginWithGoogle({
      email: cleaned,
      name: name.trim() || cleaned.split('@')[0],
      avatar: currentAvatar,
    });
    setSubmitting(false);
    if (acc) {
      onClose();
    } else if (api.error) {
      setLocalError(api.error);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Sign in with Google">
      <p className="text-sm leading-relaxed text-[var(--muted)]">
        Save your friends list and get instant live room invites on your phone whenever a friend starts a room.
      </p>

      {GOOGLE_CLIENT_ID ? (
        <div className="mt-4 flex flex-col items-center rounded-2xl bg-[var(--surface)] p-4 shadow-[0_0_0_1px_var(--line)]">
          <div ref={gisBtnRef} className="min-h-[44px]" />
          <p className="mt-2.5 text-[11px] text-[var(--faint)]">
            Or continue directly with your Google email below
          </p>
        </div>
      ) : null}

      <form onSubmit={submitEmailSignIn} className="mt-4 space-y-3">
        <div>
          <label htmlFor="google-email" className="label flex items-center gap-1.5">
            <Mail size={13} /> Google email
          </label>
          <input
            id="google-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            className="field mt-1.5"
            placeholder="you@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="google-display-name" className="label">
            Display name
          </label>
          <input
            id="google-display-name"
            type="text"
            maxLength={24}
            className="field mt-1.5"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {localError ? (
          <p className="text-xs font-semibold text-[var(--coral)]" role="alert">
            {localError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary h-13 w-full text-base"
        >
          {submitting ? <Loader2 size={18} className="animate-spin" /> : null}
          Continue with Google Account
        </button>

        <button
          type="button"
          onClick={onClose}
          className="btn-ghost w-full text-sm"
        >
          Stay in Guest mode
        </button>
      </form>
    </Sheet>
  );
}
