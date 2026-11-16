'use client';

import { useState } from 'react';
import { ArrowRight, Bell, BellRing, Check, Loader2, X } from 'lucide-react';
import { AVATAR_OPTIONS, type RoomInvite, type UseRoomReturn } from '@/types/exam';
import { autoName, readProfile } from './profile';
import { Avatar, Sheet, haptic } from './ui';

export default function NotificationsSheet({
  open,
  onClose,
  api,
}: {
  open: boolean;
  onClose: () => void;
  api: UseRoomReturn;
}) {
  const { account, notificationPermission } = api;
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  const invites: RoomInvite[] = account?.invites ?? [];

  const handleAccept = async (inv: RoomInvite) => {
    haptic([10, 30, 10]);
    setJoiningId(inv.id);
    const prof = readProfile();
    const joinAvatar = account?.avatar || prof?.avatar || AVATAR_OPTIONS[0];
    const joinName = account?.name || prof?.name || autoName(joinAvatar);
    try {
      await api.dismissRoomInvite(inv.id);
      await api.joinRoom({
        code: inv.roomCode,
        name: joinName,
        avatar: joinAvatar,
      });
      onClose();
    } finally {
      setJoiningId(null);
    }
  };

  const handleEnableAlerts = async () => {
    haptic(6);
    setRequesting(true);
    try {
      await api.requestNotificationPermission();
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Notifications">
      <div className="space-y-3 pb-3">
        {/* Browser / Phone Alert Permission */}
        {notificationPermission !== 'unsupported' ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--surface)] p-3.5 shadow-[0_0_0_1px_var(--line)]">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{
                  background:
                    notificationPermission === 'granted'
                      ? 'rgba(215, 255, 63, 0.14)'
                      : 'var(--surface-2)',
                  color:
                    notificationPermission === 'granted' ? 'var(--lime)' : 'var(--paper)',
                }}
              >
                {notificationPermission === 'granted' ? (
                  <Check size={17} />
                ) : (
                  <BellRing size={17} />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[var(--paper)]">
                  {notificationPermission === 'granted'
                    ? 'Phone & browser alerts active'
                    : notificationPermission === 'denied'
                    ? 'Alerts blocked in browser settings'
                    : 'Get notified on room invites'}
                </p>
                <p className="truncate text-[11px] text-[var(--muted)]">
                  {notificationPermission === 'granted'
                    ? 'You’ll get an alert whenever a friend invites you'
                    : notificationPermission === 'denied'
                    ? 'Allow notifications in site settings to enable alerts'
                    : 'Never miss an invite when your screen is asleep'}
                </p>
              </div>
            </div>

            {notificationPermission === 'default' ? (
              <button
                type="button"
                disabled={requesting}
                onClick={() => void handleEnableAlerts()}
                className="btn-primary !min-h-[36px] shrink-0 !rounded-xl !px-3 text-xs"
              >
                {requesting ? <Loader2 size={14} className="animate-spin" /> : 'Enable'}
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Active Room Invites */}
        {invites.length > 0 ? (
          <ul className="space-y-2">
            {invites.map((inv) => {
              const joining = joiningId === inv.id;
              return (
                <li
                  key={inv.id}
                  className="flex items-center gap-3 rounded-2xl bg-[var(--surface)] p-3 shadow-[0_0_0_1px_var(--line)]"
                >
                  <Avatar emoji={inv.fromAvatar || '🐥'} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-[var(--paper)]">
                      @{inv.fromUsername} invited you
                    </p>
                    <p className="truncate text-[11px] text-[var(--muted)]">
                      {inv.roomTitle} ·{' '}
                      <span className="code-cell font-bold text-[var(--lime)]">
                        {inv.roomCode}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      disabled={joining}
                      onClick={() => void handleAccept(inv)}
                      className="btn-primary !min-h-[36px] !rounded-xl !px-3 text-xs"
                    >
                      {joining ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <>
                          Join <ArrowRight size={13} />
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        haptic(5);
                        void api.dismissRoomInvite(inv.id);
                      }}
                      className="press flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--paper)]"
                      aria-label="Dismiss invite"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-2xl bg-[var(--surface)] px-4 py-7 text-center shadow-[0_0_0_1px_var(--line)]">
            <Bell size={22} className="mx-auto text-[var(--faint)]" />
            <p className="mt-2 text-sm font-semibold text-[var(--paper)]">
              No pending room invites
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              When friends invite you to a room, their invite will appear here.
            </p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
