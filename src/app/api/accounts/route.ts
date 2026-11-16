import { NextRequest, NextResponse } from 'next/server';
import {
  FriendEntry,
  PublicDirectoryUser,
  RoomInvite,
  UserAccount,
} from '@/types/exam';

export const dynamic = 'force-dynamic';

const TMP_ACCOUNTS_PATH = '/tmp/exam-accounts-v3.json';
const INVITE_TTL_MS = 1000 * 60 * 15; // 15 minutes

interface DiskAccountPayload {
  accounts: Record<string, UserAccount>;
  googleClientId?: string;
}

interface GlobalAccountStore {
  accounts: Map<string, UserAccount>;
  googleClientId: string;
}

const globalForAccounts = globalThis as unknown as {
  __examAccountStoreV3?: GlobalAccountStore;
};

function loadDiskData(): DiskAccountPayload {
  if (typeof window !== 'undefined') return { accounts: {} };
  try {
    const req = eval('require') as NodeRequire;
    const fs = req('fs');
    if (fs.existsSync(TMP_ACCOUNTS_PATH)) {
      const raw = fs.readFileSync(TMP_ACCOUNTS_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          accounts: (parsed.accounts || {}) as Record<string, UserAccount>,
          googleClientId:
            typeof parsed.googleClientId === 'string'
              ? parsed.googleClientId
              : '',
        };
      }
    }
  } catch {
    // Ignore disk read errors
  }
  return { accounts: {} };
}

function saveDiskData(store: GlobalAccountStore) {
  if (typeof window !== 'undefined') return;
  try {
    const req = eval('require') as NodeRequire;
    const fs = req('fs');
    const obj: Record<string, UserAccount> = {};
    for (const [k, v] of Array.from(store.accounts.entries())) {
      obj[k] = v;
    }
    const payload: DiskAccountPayload = {
      accounts: obj,
      googleClientId: store.googleClientId,
    };
    fs.writeFileSync(TMP_ACCOUNTS_PATH, JSON.stringify(payload), 'utf8');
  } catch {
    // Ignore disk write errors
  }
}

function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '')
    .slice(0, 20);
}

function isValidUsername(username: string): boolean {
  return /^[a-z0-9_.]{3,20}$/.test(username);
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

export function mergeAccounts(a: UserAccount, b: UserAccount): UserAccount {
  const now = Date.now();
  const friendMap = new Map<string, FriendEntry>();
  for (const f of [...(a.friends || []), ...(b.friends || [])]) {
    const uname = normalizeUsername(f?.username || '');
    if (!uname) continue;
    const existing = friendMap.get(uname);
    if (!existing || f.addedAt >= existing.addedAt) {
      friendMap.set(uname, {
        ...f,
        username: uname,
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
    username: primary.username || a.username || b.username,
    email: a.email.trim().toLowerCase(),
    name: primary.name || a.name || b.name,
    avatar: primary.avatar || a.avatar || b.avatar || '🐥',
    pictureUrl: primary.pictureUrl || a.pictureUrl || b.pictureUrl,
    googleVerified: Boolean(a.googleVerified || b.googleVerified),
    geminiApiKey:
      primary.geminiApiKey !== undefined
        ? primary.geminiApiKey
        : a.geminiApiKey || b.geminiApiKey,
    friends: Array.from(friendMap.values()).sort((x, y) => x.addedAt - y.addedAt),
    invites: Array.from(inviteMap.values()).sort((x, y) => y.createdAt - x.createdAt),
    updatedAt: Math.max(a.updatedAt || now, b.updatedAt || now),
  };
}

function getAccountStore(): GlobalAccountStore {
  if (!globalForAccounts.__examAccountStoreV3) {
    const accounts = new Map<string, UserAccount>();
    const disk = loadDiskData();
    for (const [email, acc] of Object.entries(disk.accounts)) {
      accounts.set(email.toLowerCase(), acc);
    }
    globalForAccounts.__examAccountStoreV3 = {
      accounts,
      googleClientId: disk.googleClientId || '',
    };
  } else {
    const disk = loadDiskData();
    if (disk.googleClientId && !globalForAccounts.__examAccountStoreV3.googleClientId) {
      globalForAccounts.__examAccountStoreV3.googleClientId = disk.googleClientId;
    }
    for (const [email, diskAcc] of Object.entries(disk.accounts)) {
      const key = email.toLowerCase();
      const existing = globalForAccounts.__examAccountStoreV3.accounts.get(key);
      globalForAccounts.__examAccountStoreV3.accounts.set(
        key,
        existing ? mergeAccounts(existing, diskAcc) : diskAcc
      );
    }
  }
  return globalForAccounts.__examAccountStoreV3;
}

function findAccountByUsername(
  store: GlobalAccountStore,
  username: string
): UserAccount | undefined {
  const clean = normalizeUsername(username);
  if (!clean) return undefined;
  for (const acc of Array.from(store.accounts.values())) {
    if (acc.username?.toLowerCase() === clean) {
      return acc;
    }
  }
  return undefined;
}

function generateUniqueUsername(
  store: GlobalAccountStore,
  preferred: string,
  excludeEmail?: string
): string {
  let base = normalizeUsername(preferred);
  if (base.length < 3) {
    base = (base + 'chick').slice(0, 12);
  }
  let candidate = base;
  let counter = 2;
  while (true) {
    const taken = findAccountByUsername(store, candidate);
    if (!taken || (excludeEmail && taken.email === excludeEmail)) {
      return candidate;
    }
    candidate = `${base.slice(0, 16)}_${counter}`;
    counter++;
  }
}

async function verifyGoogleIdToken(idToken: string): Promise<{
  email: string;
  name?: string;
  picture?: string;
} | null> {
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (
      data &&
      typeof data.email === 'string' &&
      data.sub &&
      data.email_verified !== 'false'
    ) {
      return {
        email: data.email.trim().toLowerCase(),
        name: typeof data.name === 'string' ? data.name.trim() : undefined,
        picture: typeof data.picture === 'string' ? data.picture.trim() : undefined,
      };
    }
  } catch {
    // Ignore network error
  }
  return null;
}

async function verifyGoogleAccessToken(accessToken: string): Promise<{
  email: string;
  name?: string;
  picture?: string;
} | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && typeof data.email === 'string' && data.sub) {
      return {
        email: data.email.trim().toLowerCase(),
        name: typeof data.name === 'string' ? data.name.trim() : undefined,
        picture: typeof data.picture === 'string' ? data.picture.trim() : undefined,
      };
    }
  } catch {
    // Ignore network error
  }
  return null;
}

export async function GET(req: NextRequest) {
  const store = getAccountStore();
  const googleClientId =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    store.googleClientId ||
    '';

  const q = req.nextUrl.searchParams.get('q')?.trim().toLowerCase().replace(/^@+/, '');
  if (q !== undefined && req.nextUrl.searchParams.has('q')) {
    const users: PublicDirectoryUser[] = Array.from(store.accounts.values())
      .filter(
        (acc) =>
          acc.username &&
          (!q ||
            acc.username.includes(q) ||
            acc.name.toLowerCase().includes(q))
      )
      .slice(0, 15)
      .map((acc) => ({
        username: acc.username,
        name: acc.name,
        avatar: acc.avatar,
        pictureUrl: acc.pictureUrl,
      }));
    return NextResponse.json({ googleClientId, users });
  }

  return NextResponse.json({ googleClientId });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body.action || 'login');
    const store = getAccountStore();
    const now = Date.now();

    if (action === 'setGoogleClientId') {
      const clientId = String(body.clientId || '').trim();
      if (clientId && !clientId.endsWith('.apps.googleusercontent.com')) {
        return NextResponse.json(
          {
            error:
              'Invalid Google Client ID. It should end with .apps.googleusercontent.com',
          },
          { status: 400 }
        );
      }
      store.googleClientId = clientId;
      saveDiskData(store);
      return NextResponse.json({ googleClientId: store.googleClientId });
    }

    if (action === 'login') {
      const googleCredential =
        typeof body.googleCredential === 'string' ? body.googleCredential.trim() : '';
      const googleAccessToken =
        typeof body.googleAccessToken === 'string' ? body.googleAccessToken.trim() : '';

      let email = normalizeEmail(body.email);
      let verifiedName =
        typeof body.name === 'string' && body.name.trim()
          ? body.name.trim()
          : undefined;
      let verifiedPicture =
        typeof body.pictureUrl === 'string' && body.pictureUrl.trim()
          ? body.pictureUrl.trim()
          : undefined;
      let isOAuthVerified = false;

      if (googleCredential || googleAccessToken) {
        const verified = googleCredential
          ? await verifyGoogleIdToken(googleCredential)
          : await verifyGoogleAccessToken(googleAccessToken);

        if (!verified || !isValidEmail(verified.email)) {
          return NextResponse.json(
            {
              error:
                'Google OAuth token verification failed. Please try signing in again.',
            },
            { status: 401 }
          );
        }
        email = verified.email;
        verifiedName = verified.name || verifiedName;
        verifiedPicture = verified.picture || verifiedPicture;
        isOAuthVerified = true;
      } else {
        if (!isValidEmail(email)) {
          return NextResponse.json(
            { error: 'Please enter a valid Google email address.' },
            { status: 400 }
          );
        }
      }

      const existing = store.accounts.get(email);
      const defaultName = verifiedName || email.split('@')[0];
      const avatar = String(body.avatar || existing?.avatar || '🐥').trim() || '🐥';

      let assignedUsername = existing?.username;
      if (typeof body.username === 'string' && body.username.trim()) {
        const requested = normalizeUsername(body.username);
        if (isValidUsername(requested)) {
          const taken = findAccountByUsername(store, requested);
          if (!taken || taken.email === email) {
            assignedUsername = requested;
          } else if (!assignedUsername) {
            assignedUsername = generateUniqueUsername(store, requested, email);
          }
        }
      }
      if (!assignedUsername) {
        assignedUsername = generateUniqueUsername(
          store,
          verifiedName || email.split('@')[0],
          email
        );
      }

      const updated: UserAccount = existing
        ? pruneInvites({
            ...existing,
            username: assignedUsername,
            name: verifiedName || existing.name || defaultName,
            avatar,
            pictureUrl: verifiedPicture || existing.pictureUrl,
            googleVerified: isOAuthVerified || existing.googleVerified || true,
            updatedAt: now,
          })
        : {
            username: assignedUsername,
            email,
            name: defaultName,
            avatar,
            pictureUrl: verifiedPicture,
            googleVerified: true,
            friends: [],
            invites: [],
            updatedAt: now,
          };

      store.accounts.set(email, updated);
      saveDiskData(store);
      return NextResponse.json({ account: updated });
    }

    if (action === 'updateUsername') {
      const email = normalizeEmail(body.email);
      const rawNew = String(body.newUsername || '');
      const cleanNew = normalizeUsername(rawNew);

      if (!isValidEmail(email)) {
        return NextResponse.json({ error: 'Invalid account email.' }, { status: 400 });
      }
      if (!isValidUsername(cleanNew)) {
        return NextResponse.json(
          {
            error:
              'Username must be 3–20 characters using only lowercase letters, numbers, underscores (_), or dots (.).',
          },
          { status: 400 }
        );
      }

      const acc = store.accounts.get(email) || (body.account as UserAccount | undefined);
      if (!acc) {
        return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
      }

      const taken = findAccountByUsername(store, cleanNew);
      if (taken && taken.email !== email) {
        return NextResponse.json(
          { error: `@${cleanNew} is already taken. Try another username.` },
          { status: 409 }
        );
      }

      const oldUsername = acc.username;
      const updated: UserAccount = {
        ...acc,
        username: cleanNew,
        updatedAt: now,
      };
      store.accounts.set(email, updated);

      // Update username references in friends' lists
      if (oldUsername && oldUsername !== cleanNew) {
        for (const [k, otherAcc] of Array.from(store.accounts.entries())) {
          if (otherAcc.friends.some((f) => f.username === oldUsername)) {
            store.accounts.set(k, {
              ...otherAcc,
              friends: otherAcc.friends.map((f) =>
                f.username === oldUsername ? { ...f, username: cleanNew } : f
              ),
              updatedAt: now,
            });
          }
        }
      }

      saveDiskData(store);
      return NextResponse.json({ account: updated });
    }

    if (action === 'updateProfile') {
      const email = normalizeEmail(body.email);
      if (!isValidEmail(email)) {
        return NextResponse.json({ error: 'Invalid account email.' }, { status: 400 });
      }
      const acc = store.accounts.get(email) || (body.account as UserAccount | undefined);
      if (!acc) {
        return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
      }

      let nextUsername = acc.username;
      if (typeof body.newUsername === 'string' && body.newUsername.trim()) {
        const cleanNew = normalizeUsername(body.newUsername);
        if (!isValidUsername(cleanNew)) {
          return NextResponse.json(
            {
              error:
                'Username must be 3–20 characters using only lowercase letters, numbers, underscores (_), or dots (.).',
            },
            { status: 400 }
          );
        }
        const taken = findAccountByUsername(store, cleanNew);
        if (taken && taken.email !== email) {
          return NextResponse.json(
            { error: `@${cleanNew} is already taken. Try another username.` },
            { status: 409 }
          );
        }
        nextUsername = cleanNew;
      }

      const oldUsername = acc.username;
      const nextName =
        typeof body.name === 'string' && body.name.trim()
          ? body.name.trim()
          : acc.name;
      const nextAvatar =
        typeof body.avatar === 'string' && body.avatar.trim()
          ? body.avatar.trim()
          : acc.avatar;
      const nextGeminiKey =
        typeof body.geminiApiKey === 'string'
          ? body.geminiApiKey.trim()
          : acc.geminiApiKey;

      const updated: UserAccount = {
        ...acc,
        username: nextUsername,
        name: nextName,
        avatar: nextAvatar,
        geminiApiKey: nextGeminiKey,
        updatedAt: now,
      };
      store.accounts.set(email, updated);

      // Update username/name/avatar references in friends' lists
      for (const [k, otherAcc] of Array.from(store.accounts.entries())) {
        if (otherAcc.friends.some((f) => f.username === oldUsername)) {
          store.accounts.set(k, {
            ...otherAcc,
            friends: otherAcc.friends.map((f) =>
              f.username === oldUsername
                ? { ...f, username: nextUsername, name: nextName, avatar: nextAvatar }
                : f
            ),
            updatedAt: now,
          });
        }
      }

      saveDiskData(store);
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
      saveDiskData(store);
      return NextResponse.json({ account: merged });
    }

    if (action === 'addFriend') {
      const email = normalizeEmail(body.email);
      const cleanFriendUsername = normalizeUsername(
        String(body.friendUsername || '')
      );

      if (!isValidEmail(email)) {
        return NextResponse.json({ error: 'Please sign in with Google first.' }, { status: 401 });
      }
      if (!isValidUsername(cleanFriendUsername)) {
        return NextResponse.json(
          { error: 'Enter a valid @username (3–20 letters, numbers, _ or .).' },
          { status: 400 }
        );
      }

      let myAccount = store.accounts.get(email) || (body.account as UserAccount | undefined);
      if (!myAccount) {
        return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
      }
      if (myAccount.username === cleanFriendUsername) {
        return NextResponse.json(
          { error: 'You cannot add yourself as a friend.' },
          { status: 400 }
        );
      }

      // Look up friend in server store or optional directoryMatch passed from client MQTT directory
      let friendAccount = findAccountByUsername(store, cleanFriendUsername);
      const dirMatch = body.directoryMatch as PublicDirectoryUser | undefined;

      if (!friendAccount && dirMatch?.username === cleanFriendUsername && dirMatch.email) {
        friendAccount = {
          username: cleanFriendUsername,
          email: dirMatch.email.toLowerCase(),
          name: dirMatch.name || cleanFriendUsername,
          avatar: dirMatch.avatar || '🐥',
          pictureUrl: dirMatch.pictureUrl,
          googleVerified: true,
          friends: [],
          invites: [],
          updatedAt: now,
        };
        store.accounts.set(friendAccount.email, friendAccount);
      }

      if (!friendAccount) {
        return NextResponse.json(
          {
            error: `User "@${cleanFriendUsername}" not found. Ask your friend to sign in with Google and share their @username!`,
          },
          { status: 404 }
        );
      }

      const friendEntry: FriendEntry = {
        username: friendAccount.username,
        email: friendAccount.email,
        name: friendAccount.name,
        avatar: friendAccount.avatar || '🐥',
        pictureUrl: friendAccount.pictureUrl,
        addedAt: now,
      };

      const myEntryForFriend: FriendEntry = {
        username: myAccount.username,
        email: myAccount.email,
        name: myAccount.name,
        avatar: myAccount.avatar || '🐥',
        pictureUrl: myAccount.pictureUrl,
        addedAt: now,
      };

      myAccount = {
        ...myAccount,
        friends: [
          ...myAccount.friends.filter((f) => f.username !== friendEntry.username),
          friendEntry,
        ],
        updatedAt: now,
      };

      friendAccount = {
        ...friendAccount,
        friends: [
          ...friendAccount.friends.filter((f) => f.username !== myEntryForFriend.username),
          myEntryForFriend,
        ],
        updatedAt: now,
      };

      store.accounts.set(myAccount.email, myAccount);
      store.accounts.set(friendAccount.email, friendAccount);
      saveDiskData(store);
      return NextResponse.json({ account: myAccount, friend: friendEntry });
    }

    if (action === 'removeFriend') {
      const email = normalizeEmail(body.email);
      const cleanFriendUsername = normalizeUsername(
        String(body.friendUsername || '')
      );
      const myAccount = store.accounts.get(email);
      if (!myAccount) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }
      const updated: UserAccount = {
        ...myAccount,
        friends: myAccount.friends.filter((f) => f.username !== cleanFriendUsername),
        updatedAt: now,
      };
      store.accounts.set(email, updated);
      saveDiskData(store);
      return NextResponse.json({ account: updated });
    }

    if (action === 'sendInvite') {
      const fromUsername = normalizeUsername(String(body.fromUsername || ''));
      const fromEmail = normalizeEmail(body.fromEmail);
      const toUsername = normalizeUsername(String(body.toUsername || ''));
      const roomCode = String(body.roomCode || '').trim().toUpperCase();
      const roomTitle = String(body.roomTitle || 'Live Exam Room').trim();

      if (!toUsername || !roomCode) {
        return NextResponse.json(
          { error: 'Valid friend @username and room code are required.' },
          { status: 400 }
        );
      }

      const invite: RoomInvite = {
        id: `inv-${now}-${Math.random().toString(36).slice(2, 7)}`,
        fromUsername: fromUsername || fromEmail.split('@')[0] || 'friend',
        fromEmail,
        fromName: String(body.fromName || fromUsername || 'Friend'),
        fromAvatar: String(body.fromAvatar || '🐥'),
        roomCode,
        roomTitle,
        createdAt: now,
      };

      const recipient = findAccountByUsername(store, toUsername);
      if (recipient) {
        const updatedRecipient = pruneInvites({
          ...recipient,
          invites: [
            invite,
            ...recipient.invites.filter((i) => i.roomCode !== roomCode),
          ],
          updatedAt: now,
        });
        store.accounts.set(recipient.email, updatedRecipient);
        saveDiskData(store);
      }

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
      saveDiskData(store);
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
