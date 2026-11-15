import { NextRequest, NextResponse } from 'next/server';
import { FriendEntry, RoomInvite, UserAccount } from '@/types/exam';

export const dynamic = 'force-dynamic';

const TMP_ACCOUNTS_PATH = '/tmp/exam-accounts-v2.json';
const INVITE_TTL_MS = 1000 * 60 * 15; // 15 minutes

interface GlobalAccountStore {
  accounts: Map<string, UserAccount>;
}

const globalForAccounts = globalThis as unknown as {
  __examAccountStoreV2?: GlobalAccountStore;
};

function loadDiskAccounts(): Record<string, UserAccount> {
  if (typeof window !== 'undefined') return {};
  try {
    const req = eval('require') as NodeRequire;
    const fs = req('fs');
    if (fs.existsSync(TMP_ACCOUNTS_PATH)) {
      const raw = fs.readFileSync(TMP_ACCOUNTS_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, UserAccount>;
      }
    }
  } catch {
    // Ignore disk read errors
  }
  return {};
}

function saveDiskAccounts(accounts: Map<string, UserAccount>) {
  if (typeof window !== 'undefined') return;
  try {
    const req = eval('require') as NodeRequire;
    const fs = req('fs');
    const obj: Record<string, UserAccount> = {};
    for (const [k, v] of Array.from(accounts.entries())) {
      obj[k] = v;
    }
    fs.writeFileSync(TMP_ACCOUNTS_PATH, JSON.stringify(obj), 'utf8');
  } catch {
    // Ignore disk write errors
  }
}

export function mergeAccounts(a: UserAccount, b: UserAccount): UserAccount {
  const now = Date.now();
  const friendMap = new Map<string, FriendEntry>();
  for (const f of [...(a.friends || []), ...(b.friends || [])]) {
    if (!f?.email) continue;
    const key = f.email.trim().toLowerCase();
    const existing = friendMap.get(key);
    if (!existing || f.addedAt >= existing.addedAt) {
      friendMap.set(key, {
        ...f,
        email: key,
      });
    }
  }

  const inviteMap = new Map<string, RoomInvite>();
  for (const inv of [...(a.invites || []), ...(b.invites || [])]) {
    if (!inv?.id) continue;
    if (now - inv.createdAt <= INVITE_TTL_MS) {
      inviteMap.set(inv.id, inv);
    }
  }

  const primary = b.updatedAt >= a.updatedAt ? b : a;
  return {
    email: a.email.trim().toLowerCase(),
    name: primary.name || a.name || b.name,
    avatar: primary.avatar || a.avatar || b.avatar || '🐥',
    pictureUrl: primary.pictureUrl || a.pictureUrl || b.pictureUrl,
    friends: Array.from(friendMap.values()).sort((x, y) => x.addedAt - y.addedAt),
    invites: Array.from(inviteMap.values()).sort((x, y) => y.createdAt - x.createdAt),
    updatedAt: Math.max(a.updatedAt || now, b.updatedAt || now),
  };
}

function getAccountStore(): GlobalAccountStore {
  if (!globalForAccounts.__examAccountStoreV2) {
    const accounts = new Map<string, UserAccount>();
    const disk = loadDiskAccounts();
    for (const [email, acc] of Object.entries(disk)) {
      accounts.set(email.toLowerCase(), acc);
    }
    globalForAccounts.__examAccountStoreV2 = { accounts };
  } else {
    const disk = loadDiskAccounts();
    for (const [email, diskAcc] of Object.entries(disk)) {
      const key = email.toLowerCase();
      const existing = globalForAccounts.__examAccountStoreV2.accounts.get(key);
      globalForAccounts.__examAccountStoreV2.accounts.set(
        key,
        existing ? mergeAccounts(existing, diskAcc) : diskAcc
      );
    }
  }
  return globalForAccounts.__examAccountStoreV2;
}

function decodeGoogleJwt(token: string): {
  email?: string;
  name?: string;
  picture?: string;
} | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed.email === 'string') {
      return {
        email: parsed.email.trim().toLowerCase(),
        name: typeof parsed.name === 'string' ? parsed.name.trim() : undefined,
        picture:
          typeof parsed.picture === 'string' ? parsed.picture.trim() : undefined,
      };
    }
  } catch {
    // Ignore invalid JWT
  }
  return null;
}

function normalizeEmail(raw: unknown): string {
  return String(raw || '').trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function pruneInvites(acc: UserAccount): UserAccount {
  const now = Date.now();
  return {
    ...acc,
    invites: (acc.invites || []).filter((i) => now - i.createdAt <= INVITE_TTL_MS),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body.action || 'login');
    const store = getAccountStore();
    const now = Date.now();

    if (action === 'login') {
      const jwtPayload =
        typeof body.googleCredential === 'string' && body.googleCredential
          ? decodeGoogleJwt(body.googleCredential)
          : null;

      const email = normalizeEmail(jwtPayload?.email || body.email);
      if (!isValidEmail(email)) {
        return NextResponse.json(
          { error: 'Please enter a valid Google email address.' },
          { status: 400 }
        );
      }

      const defaultName = email.split('@')[0];
      const name = String(jwtPayload?.name || body.name || defaultName).trim();
      const avatar = String(body.avatar || '🐥').trim() || '🐥';
      const pictureUrl =
        jwtPayload?.picture ||
        (typeof body.pictureUrl === 'string' ? body.pictureUrl : undefined);

      const existing = store.accounts.get(email);
      const updated: UserAccount = existing
        ? pruneInvites({
            ...existing,
            name: name || existing.name,
            avatar: avatar || existing.avatar,
            pictureUrl: pictureUrl || existing.pictureUrl,
            updatedAt: now,
          })
        : {
            email,
            name: name || defaultName,
            avatar,
            pictureUrl,
            friends: [],
            invites: [],
            updatedAt: now,
          };

      store.accounts.set(email, updated);
      saveDiskAccounts(store.accounts);
      return NextResponse.json({ account: updated });
    }

    if (action === 'sync') {
      const clientAcc = body.account as UserAccount | undefined;
      const email = normalizeEmail(clientAcc?.email || body.email);
      if (!isValidEmail(email)) {
        return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
      }
      const existing = store.accounts.get(email);
      const merged =
        existing && clientAcc
          ? pruneInvites(mergeAccounts(existing, clientAcc))
          : existing
          ? pruneInvites(existing)
          : clientAcc
          ? pruneInvites(clientAcc)
          : null;

      if (!merged) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }
      store.accounts.set(email, merged);
      saveDiskAccounts(store.accounts);
      return NextResponse.json({ account: merged });
    }

    if (action === 'addFriend') {
      const email = normalizeEmail(body.email);
      const friendEmail = normalizeEmail(body.friendEmail);
      if (!isValidEmail(email) || !isValidEmail(friendEmail)) {
        return NextResponse.json(
          { error: 'Please enter a valid Google email for your friend.' },
          { status: 400 }
        );
      }
      if (email === friendEmail) {
        return NextResponse.json(
          { error: 'You cannot add your own email as a friend.' },
          { status: 400 }
        );
      }

      let myAccount = store.accounts.get(email);
      if (!myAccount && body.account) {
        myAccount = body.account as UserAccount;
      }
      if (!myAccount) {
        myAccount = {
          email,
          name: String(body.name || email.split('@')[0]),
          avatar: String(body.avatar || '🐥'),
          friends: [],
          invites: [],
          updatedAt: now,
        };
      }

      let friendAccount = store.accounts.get(friendEmail);
      if (!friendAccount) {
        friendAccount = {
          email: friendEmail,
          name: friendEmail.split('@')[0],
          avatar: '🐥',
          friends: [],
          invites: [],
          updatedAt: now,
        };
      }

      const friendEntry: FriendEntry = {
        email: friendAccount.email,
        name: friendAccount.name,
        avatar: friendAccount.avatar || '🐥',
        addedAt: now,
      };

      const myEntryForFriend: FriendEntry = {
        email: myAccount.email,
        name: myAccount.name,
        avatar: myAccount.avatar || '🐥',
        addedAt: now,
      };

      myAccount = {
        ...myAccount,
        friends: [
          ...myAccount.friends.filter((f) => f.email !== friendEntry.email),
          friendEntry,
        ],
        updatedAt: now,
      };

      friendAccount = {
        ...friendAccount,
        friends: [
          ...friendAccount.friends.filter((f) => f.email !== myEntryForFriend.email),
          myEntryForFriend,
        ],
        updatedAt: now,
      };

      store.accounts.set(email, myAccount);
      store.accounts.set(friendEmail, friendAccount);
      saveDiskAccounts(store.accounts);
      return NextResponse.json({ account: myAccount, friend: friendEntry });
    }

    if (action === 'removeFriend') {
      const email = normalizeEmail(body.email);
      const friendEmail = normalizeEmail(body.friendEmail);
      const myAccount = store.accounts.get(email);
      if (!myAccount) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }
      const updated: UserAccount = {
        ...myAccount,
        friends: myAccount.friends.filter((f) => f.email !== friendEmail),
        updatedAt: now,
      };
      store.accounts.set(email, updated);
      saveDiskAccounts(store.accounts);
      return NextResponse.json({ account: updated });
    }

    if (action === 'sendInvite') {
      const fromEmail = normalizeEmail(body.fromEmail);
      const toEmail = normalizeEmail(body.toEmail);
      const roomCode = String(body.roomCode || '').trim().toUpperCase();
      const roomTitle = String(body.roomTitle || 'Live Exam Room').trim();
      if (!isValidEmail(toEmail) || !roomCode) {
        return NextResponse.json(
          { error: 'Valid recipient email and room code are required.' },
          { status: 400 }
        );
      }

      let recipient = store.accounts.get(toEmail);
      if (!recipient) {
        recipient = {
          email: toEmail,
          name: toEmail.split('@')[0],
          avatar: '🐥',
          friends: [],
          invites: [],
          updatedAt: now,
        };
      }

      const invite: RoomInvite = {
        id: `inv-${now}-${Math.random().toString(36).slice(2, 7)}`,
        fromEmail,
        fromName: String(body.fromName || fromEmail.split('@')[0] || 'Friend'),
        fromAvatar: String(body.fromAvatar || '🐥'),
        roomCode,
        roomTitle,
        createdAt: now,
      };

      recipient = pruneInvites({
        ...recipient,
        invites: [
          invite,
          ...recipient.invites.filter((i) => i.roomCode !== roomCode),
        ],
        updatedAt: now,
      });

      store.accounts.set(toEmail, recipient);
      saveDiskAccounts(store.accounts);
      return NextResponse.json({ invite, sent: true });
    }

    if (action === 'dismissInvite') {
      const email = normalizeEmail(body.email);
      const inviteId = String(body.inviteId || '');
      const acc = store.accounts.get(email);
      if (!acc) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }
      const updated: UserAccount = {
        ...acc,
        invites: acc.invites.filter((i) => i.id !== inviteId),
        updatedAt: now,
      };
      store.accounts.set(email, updated);
      saveDiskAccounts(store.accounts);
      return NextResponse.json({ account: updated });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Account request failed' },
      { status: 500 }
    );
  }
}
