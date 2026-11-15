'use client';

/** Local guest profile (nickname + avatar), shared by the join screen and invite banner. */

export const PROFILE_KEY = 'exam_room_profile_v1';

export const ANIMAL_NAMES: Record<string, string> = {
  '🐥': 'Chick',
  '🐣': 'Hatchling',
  '🐤': 'Birdie',
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
