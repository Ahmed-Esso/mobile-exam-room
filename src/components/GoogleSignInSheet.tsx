'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import type { UseRoomReturn } from '@/types/exam';
import { Sheet, copyText, haptic } from './ui';

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
        oauth2?: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (res: { access_token?: string; error?: string; error_description?: string }) => void;
          }) => {
            requestAccessToken: (opts?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
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
  const activeClientId = (
    api.googleClientId ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    ''
  ).trim();

  const [gisReady, setGisReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [clientIdInput, setClientIdInput] = useState('');
  const [savingClientId, setSavingClientId] = useState(false);
  const [copiedOrigin, setCopiedOrigin] = useState(false);

  const gisBtnRef = useRef<HTMLDivElement>(null);
  const tokenClientRef = useRef<{ requestAccessToken: (opts?: { prompt?: string }) => void } | null>(null);
  const apiRef = useRef(api);
  apiRef.current = api;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    setClientIdInput(activeClientId);
  }, [open, activeClientId]);

  const initGoogleSdk = useCallback(() => {
    if (!activeClientId || typeof window === 'undefined' || !window.google?.accounts) return;

    // 1. Setup OAuth2 Token Client (triggers real accounts.google.com account chooser popup)
    if (window.google.accounts.oauth2) {
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: activeClientId,
        scope: 'openid email profile',
        callback: async (tokenResponse) => {
          if (tokenResponse.error || !tokenResponse.access_token) {
            setLocalError(
              tokenResponse.error_description ||
                tokenResponse.error ||
                'Google sign-in was cancelled.'
            );
            setSubmitting(false);
            return;
          }
          setSubmitting(true);
          const acc = await apiRef.current.loginWithGoogle({
            googleAccessToken: tokenResponse.access_token,
            avatar: currentAvatar,
          });
          setSubmitting(false);
          if (acc) {
            haptic([10, 35, 10]);
            onCloseRef.current();
          } else if (apiRef.current.error) {
            setLocalError(apiRef.current.error);
          }
        },
      });
    }

    // 2. Setup Google Identity Services Sign-In Button
    if (window.google.accounts.id && gisBtnRef.current) {
      window.google.accounts.id.initialize({
        client_id: activeClientId,
        callback: async (response) => {
          if (!response.credential) return;
          setSubmitting(true);
          const acc = await apiRef.current.loginWithGoogle({
            googleCredential: response.credential,
            avatar: currentAvatar,
          });
          setSubmitting(false);
          if (acc) {
            haptic([10, 35, 10]);
            onCloseRef.current();
          } else if (apiRef.current.error) {
            setLocalError(apiRef.current.error);
          }
        },
      });
      gisBtnRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(gisBtnRef.current, {
        theme: 'filled_black',
        size: 'large',
        width: 320,
        shape: 'pill',
        text: 'continue_with',
      });
    }

    setGisReady(true);
  }, [activeClientId, currentAvatar]);

  useEffect(() => {
    if (!open || !activeClientId || typeof window === 'undefined') return;

    if (window.google?.accounts?.id || window.google?.accounts?.oauth2) {
      initGoogleSdk();
      return;
    }

    let existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (!existing) {
      existing = document.createElement('script');
      existing.src = 'https://accounts.google.com/gsi/client';
      existing.async = true;
      existing.defer = true;
      document.head.appendChild(existing);
    }

    const onLoad = () => initGoogleSdk();
    existing.addEventListener('load', onLoad);
    return () => {
      existing?.removeEventListener('load', onLoad);
    };
  }, [open, activeClientId, initGoogleSdk]);

  const handlePopupClick = () => {
    setLocalError(null);
    if (!tokenClientRef.current) {
      setLocalError('Google Sign-In is still loading — please tap again in a second.');
      initGoogleSdk();
      return;
    }
    haptic([8, 25, 8]);
    setSubmitting(true);
    try {
      tokenClientRef.current.requestAccessToken({ prompt: 'select_account' });
    } catch {
      setSubmitting(false);
      setLocalError('Could not open the Google sign-in window.');
    }
  };

  const handleSaveClientId = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = clientIdInput.trim();
    if (!cleaned || !cleaned.includes('.apps.googleusercontent.com')) {
      setLocalError('Enter a valid Google OAuth Client ID ending in .apps.googleusercontent.com');
      return;
    }
    setLocalError(null);
    setSavingClientId(true);
    haptic([8, 30, 8]);
    await api.saveGoogleClientId(cleaned);
    setSavingClientId(false);
    setShowSetup(false);
  };

  const currentOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://mobile-exam-room.vercel.app';

  return (
    <Sheet open={open} onClose={onClose} title="Sign in with Google">
      <div className="space-y-4 pb-2">
        <div className="flex items-start gap-3 rounded-2xl bg-[var(--surface)] p-3.5 shadow-[0_0_0_1px_var(--line)]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(215,255,63,0.16)] text-[var(--lime)]">
            <ShieldCheck size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold">Verified Google Account</p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">
              Claim your unique <strong className="text-[var(--paper)]">@username</strong>, add friends, and send live 1-tap room invites across phones.
            </p>
          </div>
        </div>

        {activeClientId ? (
          <div className="space-y-3 rounded-2xl bg-[var(--surface)] p-4 shadow-[0_0_0_1px_var(--line)]">
            {/* 1. Custom Google Account Chooser Button */}
            <button
              type="button"
              disabled={submitting || !gisReady}
              onClick={handlePopupClick}
              className="press flex h-13 w-full items-center justify-center gap-3 rounded-full bg-white px-5 text-[15px] font-semibold text-[#1f1f1f] shadow-md disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 size={18} className="animate-spin text-[#1f1f1f]" />
              ) : (
                <GoogleGIcon />
              )}
              <span>{submitting ? 'Verifying with Google…' : 'Continue with Google'}</span>
            </button>

            <div className="flex items-center gap-3 text-[11px] text-[var(--faint)]">
              <span className="h-px flex-1 bg-[var(--line)]" />
              <span>or one-tap widget</span>
              <span className="h-px flex-1 bg-[var(--line)]" />
            </div>

            {/* 2. Official GIS Rendered Button */}
            <div className="flex justify-center">
              <div ref={gisBtnRef} className="min-h-[44px]" />
            </div>

            <button
              type="button"
              onClick={() => setShowSetup((v) => !v)}
              className="mx-auto block pt-1 text-[11px] font-semibold text-[var(--muted)] underline underline-offset-2 hover:text-[var(--paper)]"
            >
              {showSetup ? 'Hide OAuth Client ID settings' : 'Change Google OAuth Client ID'}
            </button>
          </div>
        ) : (
          <div className="rounded-2xl bg-[var(--surface)] p-4 shadow-[0_0_0_1.5px_var(--amber)]">
            <p className="flex items-center gap-2 font-display text-sm font-bold text-[var(--amber)]">
              <KeyRound size={16} /> Connect Google OAuth Client ID
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              To enable the official <strong className="text-[var(--paper)]">accounts.google.com</strong> sign-in popup, paste a Web Application OAuth Client ID from Google Cloud Console once (saved on the server for all phones).
            </p>
          </div>
        )}

        {!activeClientId || showSetup ? (
          <form
            onSubmit={handleSaveClientId}
            className="space-y-3 rounded-2xl bg-[var(--ink-2)] p-4 shadow-[0_0_0_1px_var(--line)]"
          >
            <div className="space-y-1.5 text-[11px] leading-relaxed text-[var(--muted)]">
              <p className="font-semibold text-[var(--paper)]">Quick 1-minute Google Cloud setup:</p>
              <p>
                1. Open{' '}
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-[var(--lime)] underline"
                >
                  Google Cloud Credentials <ExternalLink size={11} />
                </a>{' '}
                → Create OAuth Client ID → <strong>Web application</strong>.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span>2. Add Authorized JavaScript Origin:</span>
                <button
                  type="button"
                  onClick={async () => {
                    if (await copyText(currentOrigin)) {
                      setCopiedOrigin(true);
                      window.setTimeout(() => setCopiedOrigin(false), 1500);
                    }
                  }}
                  className="chip !h-7 !min-h-0 !px-2.5 text-[11px]"
                  data-active={copiedOrigin}
                >
                  {copiedOrigin ? <Check size={12} /> : <Copy size={12} />}
                  <span className="code-cell">{currentOrigin}</span>
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="oauth-client-id" className="label">
                Google OAuth Client ID
              </label>
              <input
                id="oauth-client-id"
                type="text"
                className="field code-cell mt-1.5 text-xs"
                placeholder="123456789-abc...apps.googleusercontent.com"
                value={clientIdInput}
                onChange={(e) => setClientIdInput(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={savingClientId || !clientIdInput.trim()}
              className="btn-primary h-12 w-full text-sm"
            >
              {savingClientId ? <Loader2 size={16} className="animate-spin" /> : null}
              Save &amp; Activate Google Sign-In
            </button>
          </form>
        ) : null}

        {localError ? (
          <p className="text-xs font-semibold text-[var(--coral)]" role="alert">
            {localError}
          </p>
        ) : null}

        <button type="button" onClick={onClose} className="btn-ghost w-full text-sm">
          Continue as Guest
        </button>
      </div>
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
