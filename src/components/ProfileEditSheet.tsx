'use client';

import { useEffect, useState } from 'react';
import {
  AtSign,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Sparkles,
  User,
} from 'lucide-react';
import { AVATAR_OPTIONS, type UseRoomReturn } from '@/types/exam';
import AnimalAvatarArt, { animalLabel } from './AnimalAvatarArt';
import { ANIMAL_NAMES, autoName, readProfile } from './profile';
import { Avatar, Sheet, haptic } from './ui';

export default function ProfileEditSheet({
  open,
  onClose,
  api,
  initialName,
  initialAvatar,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  api: UseRoomReturn;
  initialName?: string;
  initialAvatar?: string;
  onSaved?: (updated: { name: string; avatar: string }) => void;
}) {
  const { account, me, geminiApiKey } = api;

  const [avatar, setAvatar] = useState<string>(AVATAR_OPTIONS[0]);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSavedNotice(false);
    setShowKey(false);
    const localProf = readProfile();
    const resolvedAvatar =
      initialAvatar || me?.avatar || account?.avatar || localProf?.avatar || AVATAR_OPTIONS[0];
    const resolvedName =
      initialName || me?.name || account?.name || localProf?.name || autoName(resolvedAvatar);

    setAvatar(resolvedAvatar);
    setName(resolvedName);
    setUsername(account?.username ?? '');
    setApiKeyInput(geminiApiKey || account?.geminiApiKey || '');
  }, [open, initialAvatar, initialName, me, account, geminiApiKey]);

  const trimmedKey = apiKeyInput.trim();
  const hasKey = trimmedKey.length > 0;
  const cleanHandle = username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20);
  const handleValid = !account || cleanHandle.length >= 3;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handleValid) return;
    setSaving(true);
    haptic([10, 30, 10]);

    const finalName = name.trim() || account?.name || autoName(avatar);

    try {
      api.setGeminiApiKey(trimmedKey);
      await api.updateMemberProfile({
        name: finalName,
        avatar,
        username: account ? cleanHandle : undefined,
        geminiApiKey: trimmedKey,
      });
      onSaved?.({ name: finalName, avatar });
      setSavedNotice(true);
      window.setTimeout(() => {
        onClose();
      }, 280);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Edit profile">
      <form onSubmit={handleSave} className="space-y-5 pb-4">
        {/* Live Portrait Preview */}
        <div className="flex items-center gap-4 rounded-2xl bg-[var(--surface)] p-3.5 shadow-[0_0_0_1px_var(--line)]">
          <Avatar emoji={avatar} size={64} ring="me" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-bold leading-tight">
              {name.trim() || autoName(avatar)}
            </p>
            <p className="mt-0.5 text-xs font-medium text-[var(--muted)]">
              {animalLabel(avatar) ?? ANIMAL_NAMES[avatar] ?? 'Animal'} portrait
              {account ? (
                <span className="text-[var(--lime)]"> · @{cleanHandle || account.username}</span>
              ) : (
                ' · Guest'
              )}
            </p>
          </div>
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{
              background: hasKey ? 'rgba(215, 255, 63, 0.14)' : 'rgba(255, 176, 46, 0.12)',
              color: hasKey ? 'var(--lime)' : 'var(--amber)',
            }}
          >
            {hasKey ? <Check size={12} /> : <Lock size={11} />}
            {hasKey ? 'AI Unlocked' : 'AI Locked'}
          </span>
        </div>

        {/* Cartoon Animal Portrait Grid */}
        <div>
          <p className="label">Choose your cartoon animal</p>
          <div className="mt-2.5 grid grid-cols-4 gap-2">
            {AVATAR_OPTIONS.map((a) => {
              const active = a === avatar;
              const label = animalLabel(a) ?? ANIMAL_NAMES[a] ?? a;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => {
                    haptic(6);
                    setAvatar(a);
                  }}
                  aria-label={`Avatar ${label}`}
                  aria-pressed={active}
                  className="press flex flex-col items-center gap-1.5 rounded-2xl px-2 py-2.5 transition-colors"
                  style={{
                    background: active ? 'var(--surface-3)' : 'var(--surface)',
                    boxShadow: active
                      ? '0 0 0 2px var(--lime)'
                      : '0 0 0 1px var(--line)',
                  }}
                >
                  <AnimalAvatarArt emoji={a} size={44} />
                  <span
                    className="text-[11px] font-semibold leading-none"
                    style={{ color: active ? 'var(--lime)' : 'var(--muted)' }}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Display Name & Optional @username */}
        <div className="space-y-3">
          <div>
            <label htmlFor="profile-edit-name" className="label flex items-center gap-1.5">
              <User size={12} /> Display name
            </label>
            <input
              id="profile-edit-name"
              type="text"
              className="field mt-1.5 font-semibold"
              value={name}
              maxLength={18}
              placeholder="Your name in the room"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {account ? (
            <div>
              <label htmlFor="profile-edit-handle" className="label flex items-center gap-1.5">
                <AtSign size={12} /> Public @username
              </label>
              <div className="relative mt-1.5">
                <AtSign
                  size={15}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                />
                <input
                  id="profile-edit-handle"
                  type="text"
                  className="field code-cell pl-9 font-semibold"
                  value={username}
                  placeholder="your_username"
                  onChange={(e) =>
                    setUsername(
                      e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20)
                    )
                  }
                />
              </div>
              {!handleValid ? (
                <p className="mt-1 text-xs text-[var(--coral)]">
                  Username must be at least 3 characters.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Dedicated Gemini API Key Setting */}
        <div className="rounded-2xl bg-[var(--surface)] p-3.5 shadow-[0_0_0_1px_var(--line)]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <label
                htmlFor="profile-gemini-key"
                className="flex items-center gap-1.5 text-sm font-bold text-[var(--paper)]"
              >
                <Sparkles size={15} className="text-[var(--pink)]" />
                Gemini API Key
              </label>
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">
                Saving your Gemini API key here automatically unlocks PDF &amp; Screenshot uploads in
                Question Studio.
              </p>
            </div>
            {hasKey ? (
              <button
                type="button"
                onClick={() => {
                  haptic(5);
                  setApiKeyInput('');
                }}
                className="chip !h-7 !min-h-0 shrink-0 !px-2.5 text-[11px] text-[var(--muted)]"
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="relative mt-3">
            <KeyRound
              size={15}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            />
            <input
              id="profile-gemini-key"
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              className="field code-cell pl-10 pr-11 text-sm"
              placeholder="AIza..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
            />
            <button
              type="button"
              onClick={() => {
                haptic(5);
                setShowKey((v) => !v);
              }}
              aria-label={showKey ? 'Hide Gemini API key' : 'Show Gemini API key'}
              className="press absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-[var(--muted)] hover:text-[var(--paper)]"
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <p
            className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold"
            style={{ color: hasKey ? 'var(--lime)' : 'var(--muted)' }}
          >
            {hasKey ? <Check size={12} /> : <Lock size={12} />}
            {hasKey
              ? 'PDF & Screenshot AI Extractor unlocked across all rooms'
              : 'Optional — needed only if you upload PDFs or exam screenshots'}
          </p>
        </div>

        {/* Save Footer */}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !handleValid}
            className="btn-primary flex-[2]"
          >
            {saving ? (
              <Loader2 size={18} className="animate-spin" />
            ) : savedNotice ? (
              <Check size={18} strokeWidth={2.75} />
            ) : null}
            {savedNotice ? 'Profile saved' : 'Save profile'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
