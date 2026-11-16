'use client';

/** Local guest profile (nickname + avatar), shared by the join screen and invite banner. */

export const PROFILE_KEY = 'exam_room_profile_v1';

export const ANIMAL_NAMES: Record<string, string> = {
  '🐥': 'Chick',
  '🦋': 'Butterfly',
  '🐬': 'Dolphin',
  '🦉': 'Owl',
  '🐐': 'Goat',
  '🦊': 'Fox',
  '🐼': 'Panda',
  '🦁': 'Lion',
  '🐸': 'Frog',
  '🐱': 'Cat',
  '🐨': 'Koala',
  '🦄': 'Unicorn',
  '🐣': 'Chick',
  '🐤': 'Chick',
  '🐙': 'Octo',
  '🐯': 'Tiger',
  '🦖': 'Rex',
  '🐝': 'Bee',
  '🐧': 'Pingu',
};

const ADJECTIVES = ['Swift', 'Clever', 'Lucky', 'Bold', 'Sneaky', 'Sharp', 'Calm', 'Turbo', 'Witty', 'Brave'];

export function autoName(avatar: string) {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  return `${adj} ${ANIMAL_NAMES[avatar] ?? 'Chick'}`;
}

export interface Profile {
  name: string;
  avatar: string;
  custom: boolean;
}

export function readProfile(): Profile | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile) {
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Pulls a 6-character room code out of raw text or a full invite link. */
export function extractRoomCode(raw: string): string | null {
  const text = (raw || '').trim();
  if (!text) return null;
  const fromLink = text.match(/[?&]room=([A-Za-z0-9]{6})\b/);
  if (fromLink) return fromLink[1].toUpperCase();
  const token = text.toUpperCase().match(/\b[A-Z0-9]{6}\b/);
  if (token) return token[0];
  const compact = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return compact.length === 6 ? compact : null;
}

/* -------------------------------------------------------------------------- */
/* App layout density & UI scale preferences                                  */
/* -------------------------------------------------------------------------- */

export type LayoutDensity = 'compact' | 'normal' | 'comfortable';
export type LayoutScale = 'sm' | 'md' | 'lg';

export interface LayoutPreferences {
  density: LayoutDensity;
  scale: LayoutScale;
}

export const LAYOUT_STORAGE_KEY = 'exam_room_layout_v1';
export const LAYOUT_EVENT = 'exam-room-layout-updated';

export const DEFAULT_LAYOUT: LayoutPreferences = {
  density: 'compact',
  scale: 'md',
};

export function readLayout(): LayoutPreferences {
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<LayoutPreferences>;
    const density: LayoutDensity =
      parsed.density === 'compact' || parsed.density === 'normal' || parsed.density === 'comfortable'
        ? parsed.density
        : DEFAULT_LAYOUT.density;
    const scale: LayoutScale =
      parsed.scale === 'sm' || parsed.scale === 'md' || parsed.scale === 'lg'
        ? parsed.scale
        : DEFAULT_LAYOUT.scale;
    return { density, scale };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function applyLayout(prefs: LayoutPreferences) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.scale = prefs.scale;
  document.documentElement.dataset.density = prefs.density;
}

export function saveLayout(prefs: LayoutPreferences) {
  applyLayout(prefs);
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(prefs));
    window.dispatchEvent(new CustomEvent<LayoutPreferences>(LAYOUT_EVENT, { detail: prefs }));
  } catch {
    /* ignore */
  }
}
