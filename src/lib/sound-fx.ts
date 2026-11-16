const STORAGE_SOUND_KEY = 'exam_room_sound_v1';
export const SOUND_EVENT = 'exam-room-sound-updated';

let sharedAudioCtx: AudioContext | null = null;
let unlockAttached = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      sharedAudioCtx = new AudioCtx();
    } catch {
      return null;
    }
  }
  if (sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_SOUND_KEY);
    if (raw === null) return true;
    return raw !== 'false' && raw !== '0';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): boolean {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_SOUND_KEY, enabled ? 'true' : 'false');
      window.dispatchEvent(
        new CustomEvent(SOUND_EVENT, { detail: enabled })
      );
    } catch {
      // Ignore storage errors
    }
  }
  if (enabled) {
    getAudioContext();
    playTapSound();
  }
  return enabled;
}

/**
 * Attaches one-time passive pointer/touch/key listeners so iOS Safari & mobile Chrome
 * unlock the Web Audio API context on the user's very first interaction.
 */
export function unlockAudio(): void {
  if (typeof window === 'undefined' || unlockAttached) return;
  unlockAttached = true;

  const handleUnlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    window.removeEventListener('pointerdown', handleUnlock);
    window.removeEventListener('touchstart', handleUnlock);
    window.removeEventListener('keydown', handleUnlock);
  };

  window.addEventListener('pointerdown', handleUnlock, { passive: true, once: true });
  window.addEventListener('touchstart', handleUnlock, { passive: true, once: true });
  window.addEventListener('keydown', handleUnlock, { passive: true, once: true });
}

interface ToneOptions {
  freqStart: number;
  freqEnd?: number;
  durationSec: number;
  delaySec?: number;
  type?: OscillatorType;
  gainPeak?: number;
}

function scheduleTone(ctx: AudioContext, opts: ToneOptions) {
  const start = ctx.currentTime + (opts.delaySec || 0);
  const stop = start + opts.durationSec;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = opts.type || 'sine';
  osc.frequency.setValueAtTime(opts.freqStart, start);
  if (opts.freqEnd && opts.freqEnd !== opts.freqStart) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, opts.freqEnd),
      stop
    );
  }

  const peak = opts.gainPeak ?? 0.08;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, stop);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(start);
  osc.stop(stop + 0.01);
}

function withAudio(fn: (ctx: AudioContext) => void) {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    fn(ctx);
  } catch {
    // Ignore Web Audio errors on restricted devices
  }
}

export function playTapSound(): void {
  withAudio((ctx) => {
    scheduleTone(ctx, {
      freqStart: 540,
      freqEnd: 700,
      durationSec: 0.03,
      type: 'sine',
      gainPeak: 0.055,
    });
  });
}

export function playLockSound(): void {
  withAudio((ctx) => {
    scheduleTone(ctx, {
      freqStart: 440,
      freqEnd: 660,
      durationSec: 0.09,
      type: 'sine',
      gainPeak: 0.075,
    });
  });
}

export function playCorrectSound(): void {
  withAudio((ctx) => {
    scheduleTone(ctx, {
      freqStart: 523.25,
      durationSec: 0.11,
      delaySec: 0,
      type: 'sine',
      gainPeak: 0.08,
    });
    scheduleTone(ctx, {
      freqStart: 659.25,
      durationSec: 0.12,
      delaySec: 0.07,
      type: 'sine',
      gainPeak: 0.085,
    });
    scheduleTone(ctx, {
      freqStart: 783.99,
      durationSec: 0.18,
      delaySec: 0.14,
      type: 'sine',
      gainPeak: 0.09,
    });
  });
}

export function playWrongSound(): void {
  withAudio((ctx) => {
    scheduleTone(ctx, {
      freqStart: 260,
      durationSec: 0.12,
      delaySec: 0,
      type: 'triangle',
      gainPeak: 0.07,
    });
    scheduleTone(ctx, {
      freqStart: 185,
      durationSec: 0.17,
      delaySec: 0.1,
      type: 'triangle',
      gainPeak: 0.065,
    });
  });
}

export function playReactionSound(): void {
  withAudio((ctx) => {
    scheduleTone(ctx, {
      freqStart: 740,
      freqEnd: 1060,
      durationSec: 0.065,
      type: 'sine',
      gainPeak: 0.06,
    });
  });
}

export function playNextQuestionSound(): void {
  withAudio((ctx) => {
    scheduleTone(ctx, {
      freqStart: 493.88,
      durationSec: 0.08,
      delaySec: 0,
      type: 'sine',
      gainPeak: 0.07,
    });
    scheduleTone(ctx, {
      freqStart: 659.25,
      durationSec: 0.12,
      delaySec: 0.065,
      type: 'sine',
      gainPeak: 0.075,
    });
  });
}

export function playExamStartSound(): void {
  withAudio((ctx) => {
    const notes = [392.0, 493.88, 587.33, 783.99];
    notes.forEach((freq, i) => {
      scheduleTone(ctx, {
        freqStart: freq,
        durationSec: i === notes.length - 1 ? 0.22 : 0.1,
        delaySec: i * 0.065,
        type: 'sine',
        gainPeak: 0.08,
      });
    });
  });
}

export function playPodiumSound(): void {
  withAudio((ctx) => {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      scheduleTone(ctx, {
        freqStart: freq,
        durationSec: i === notes.length - 1 ? 0.34 : 0.11,
        delaySec: i * 0.08,
        type: 'triangle',
        gainPeak: 0.085,
      });
    });
  });
}

export function playNotificationSound(): void {
  withAudio((ctx) => {
    scheduleTone(ctx, {
      freqStart: 880,
      durationSec: 0.12,
      delaySec: 0,
      type: 'sine',
      gainPeak: 0.085,
    });
    scheduleTone(ctx, {
      freqStart: 1318.5,
      durationSec: 0.22,
      delaySec: 0.09,
      type: 'sine',
      gainPeak: 0.09,
    });
  });
}
