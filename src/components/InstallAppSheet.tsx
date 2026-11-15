'use client';

import { useEffect, useState } from 'react';
import { Download, MoreVertical, PlusSquare, Share, Smartphone } from 'lucide-react';
import { Sheet, haptic } from './ui';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let cachedPrompt: BeforeInstallPromptEvent | null = null;

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detectIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function InstallAppButton({ compact = false }: { compact?: boolean }) {
  const [standalone, setStandalone] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    cachedPrompt
  );
  const [guideOpen, setGuideOpen] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneMode());
    setIsIos(detectIos());

    // Register service worker for Chrome WebAPK / PWA installability
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      cachedPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    const onAppInstalled = () => {
      cachedPrompt = null;
      setDeferredPrompt(null);
      setStandalone(true);
      setGuideOpen(false);
    };

    const media = window.matchMedia('(display-mode: standalone)');
    const onDisplayChange = (e: MediaQueryListEvent) => {
      if (e.matches) setStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    media.addEventListener?.('change', onDisplayChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
      media.removeEventListener?.('change', onDisplayChange);
    };
  }, []);

  if (standalone) return null;

  const handleInstallClick = async () => {
    haptic([8, 25, 8]);
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          cachedPrompt = null;
          setDeferredPrompt(null);
          return;
        }
      } catch {
        /* fallback to instructions sheet */
      }
    }
    setGuideOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleInstallClick()}
        className={`chip shrink-0 ${compact ? 'h-9 min-h-0 px-2.5 text-xs' : 'h-9 min-h-0 px-3 text-xs'}`}
        aria-label="Install Exam Room to Home Screen"
      >
        <Download size={13} className="text-[var(--lime)]" />
        <span>{compact ? 'Install' : 'Install App'}</span>
      </button>

      <InstallGuideSheet
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        isIos={isIos}
        hasNativePrompt={Boolean(deferredPrompt)}
        onTriggerNative={async () => {
          if (!deferredPrompt) return;
          await deferredPrompt.prompt();
        }}
      />
    </>
  );
}

function InstallGuideSheet({
  open,
  onClose,
  isIos,
  hasNativePrompt,
  onTriggerNative,
}: {
  open: boolean;
  onClose: () => void;
  isIos: boolean;
  hasNativePrompt: boolean;
  onTriggerNative: () => Promise<void>;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Add Exam Room to Home Screen">
      <div className="space-y-4 pb-2">
        <div className="flex items-center gap-3 rounded-2xl bg-[var(--surface)] p-3.5 shadow-[0_0_0_1px_var(--line)]">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--ink)] text-2xl shadow-[0_0_0_1px_var(--line-strong)]">
            🐥
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-bold">Exam Room App</p>
            <p className="text-xs text-[var(--muted)]">
              Launches full-screen like a native app with its own home screen icon.
            </p>
          </div>
        </div>

        {hasNativePrompt ? (
          <button
            type="button"
            onClick={() => void onTriggerNative()}
            className="btn-primary h-13 w-full text-base"
          >
            <Download size={18} /> Install Now
          </button>
        ) : null}

        {/* Safari (iPhone / iPad) Instructions */}
        <section
          className="rounded-2xl bg-[var(--surface)] p-4 shadow-[0_0_0_1px_var(--line)]"
          style={isIos ? { boxShadow: '0 0 0 1.5px var(--lime)' } : undefined}
        >
          <p className="flex items-center gap-2 font-display text-sm font-bold">
            <Smartphone size={16} className="text-[var(--lime)]" />
            Safari on iPhone / iPad
          </p>
          <ol className="mt-3 space-y-2.5 text-xs leading-relaxed text-[var(--muted)]">
            <li className="flex items-start gap-2.5">
              <span className="code-cell flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)] text-[11px] font-bold text-[var(--paper)]">
                1
              </span>
              <span>
                Tap the <strong className="text-[var(--paper)]">Share</strong> button{' '}
                <Share size={13} className="inline text-[var(--peri)]" /> in Safari&apos;s bottom
                (or top) toolbar.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="code-cell flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)] text-[11px] font-bold text-[var(--paper)]">
                2
              </span>
              <span>
                Scroll down and tap{' '}
                <strong className="text-[var(--paper)]">
                  &ldquo;Add to Home Screen&rdquo; / &ldquo;إضافة إلى الشاشة الرئيسية&rdquo;
                </strong>{' '}
                <PlusSquare size={13} className="inline text-[var(--lime)]" />.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="code-cell flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)] text-[11px] font-bold text-[var(--paper)]">
                3
              </span>
              <span>
                Tap <strong className="text-[var(--paper)]">&ldquo;Add&rdquo;</strong> in the top
                corner.
              </span>
            </li>
          </ol>
        </section>

        {/* Chrome (Android / Desktop) Instructions */}
        <section
          className="rounded-2xl bg-[var(--surface)] p-4 shadow-[0_0_0_1px_var(--line)]"
          style={!isIos ? { boxShadow: '0 0 0 1.5px var(--peri)' } : undefined}
        >
          <p className="flex items-center gap-2 font-display text-sm font-bold">
            <Download size={16} className="text-[var(--peri)]" />
            Chrome on Android / Desktop
          </p>
          <ol className="mt-3 space-y-2 text-xs leading-relaxed text-[var(--muted)]">
            <li className="flex items-start gap-2.5">
              <span className="code-cell flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)] text-[11px] font-bold text-[var(--paper)]">
                1
              </span>
              <span>
                Tap the <strong className="text-[var(--paper)]">⋮</strong> menu{' '}
                <MoreVertical size={13} className="inline text-[var(--paper)]" /> in the top right
                of Chrome (or the install icon in the address bar on desktop).
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="code-cell flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)] text-[11px] font-bold text-[var(--paper)]">
                2
              </span>
              <span>
                Tap <strong className="text-[var(--paper)]">&ldquo;Add to Home screen&rdquo;</strong>{' '}
                or <strong className="text-[var(--paper)]">&ldquo;Install app&rdquo;</strong>.
              </span>
            </li>
          </ol>
        </section>
      </div>
    </Sheet>
  );
}
