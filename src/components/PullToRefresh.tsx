'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, Loader2, RefreshCw } from 'lucide-react';
import { haptic } from './ui';

const THRESHOLD = 68;
const MAX_PULL = 104;

/**
 * Touch swipe-down pull-to-refresh wrapper for Chrome, Safari, and Home Screen PWAs.
 * Triggers when the active `.scroll-area` (or window) is scrolled to the very top.
 */
export default function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startY = useRef<number | null>(null);
  const dragging = useRef(false);
  const crossedThreshold = useRef(false);

  const isAtTop = useCallback((target: EventTarget | null): boolean => {
    if (typeof document === 'undefined') return false;
    // Do not intercept drags while a bottom sheet / modal is open
    if (document.querySelector('[role="dialog"]')) return false;

    const el = target instanceof Element ? target : null;
    const scroller = el?.closest('.scroll-area') as HTMLElement | null;
    if (scroller) {
      return scroller.scrollTop <= 2;
    }
    const anyScroller = document.querySelector('.scroll-area') as HTMLElement | null;
    if (anyScroller) {
      return anyScroller.scrollTop <= 2;
    }
    return window.scrollY <= 2;
  }, []);

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (refreshing || e.touches.length !== 1) return;
    if (!isAtTop(e.target)) {
      startY.current = null;
      dragging.current = false;
      return;
    }
    startY.current = e.touches[0].clientY;
    dragging.current = false;
    crossedThreshold.current = false;
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (refreshing || startY.current === null || e.touches.length !== 1) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 6) {
      if (dragging.current) setPull(0);
      return;
    }
    if (!isAtTop(e.target)) {
      startY.current = null;
      setPull(0);
      return;
    }
    dragging.current = true;
    // Rubber-band resistance
    const damped = Math.min(MAX_PULL, Math.round((dy - 6) * 0.52));
    if (damped >= THRESHOLD && !crossedThreshold.current) {
      crossedThreshold.current = true;
      haptic(10);
    } else if (damped < THRESHOLD) {
      crossedThreshold.current = false;
    }
    setPull(damped);
  };

  const finishDrag = async () => {
    startY.current = null;
    if (!dragging.current) return;
    dragging.current = false;

    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPull(52);
      haptic([8, 25, 8]);
      try {
        await onRefresh();
      } finally {
        window.setTimeout(() => {
          setRefreshing(false);
          setPull(0);
        }, 320);
      }
    } else {
      setPull(0);
    }
  };

  const visible = pull > 6 || refreshing;
  const ready = pull >= THRESHOLD;

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={() => void finishDrag()}
      onTouchCancel={() => void finishDrag()}
    >
      {/* Pull Indicator Pill */}
      {visible ? (
        <div
          aria-live="polite"
          className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center"
          style={{
            transform: `translateY(${Math.max(10, pull - 28)}px)`,
            opacity: refreshing ? 1 : Math.min(1, pull / 40),
            transition: dragging.current ? 'none' : 'transform 260ms var(--ease-out), opacity 220ms ease',
          }}
        >
          <div
            className="glass flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold shadow-lg"
            style={{
              color: refreshing || ready ? 'var(--lime)' : 'var(--paper)',
              boxShadow:
                refreshing || ready
                  ? '0 0 0 1.5px var(--lime), 0 12px 24px -10px rgba(0,0,0,0.85)'
                  : '0 0 0 1px var(--line-strong), 0 12px 24px -10px rgba(0,0,0,0.85)',
            }}
          >
            {refreshing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Refreshing…</span>
              </>
            ) : ready ? (
              <>
                <RefreshCw size={14} />
                <span>Release to refresh</span>
              </>
            ) : (
              <>
                <ArrowDown size={14} />
                <span>Swipe down to refresh</span>
              </>
            )}
          </div>
        </div>
      ) : null}

      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{
          transform: pull > 0 ? `translateY(${Math.round(pull * 0.45)}px)` : undefined,
          transition: dragging.current ? 'none' : 'transform 280ms var(--ease-out)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
