'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mqtt, { MqttClient } from 'mqtt';
import {
  CompactRoomState,
  ConnectionStatus,
  EmojiReaction,
  GameMode,
  Member,
  MemberAnswer,
  MemberAnswerTag,
  ParseQuestionsResult,
  PublicDirectoryUser,
  Question,
  QuestionAttachment,
  RoomDelta,
  RoomInvite,
  RoomSettingsUpdate,
  RoomState,
  SendReactionInput,
  UseRoomReturn,
  UserAccount,
} from '@/types/exam';
import { parseMarkdownQuestions } from '@/lib/markdown-parser';
import {
  computePoints,
  computeQuestionsDigest,
  mergeRoomStates,
} from '@/lib/room-store';
import {
  playNotificationSound,
  playReactionSound,
  unlockAudio,
} from '@/lib/sound-fx';

const STORAGE_MEMBER_ID_KEY = 'exam_room_member_id_v2';
const STORAGE_ACTIVE_ROOM_KEY = 'exam_room_active_code_v2';
const STORAGE_ACCOUNT_KEY = 'exam_room_account_v4';
const STORAGE_GOOGLE_CLIENT_ID_KEY = 'exam_room_google_client_id_v1';
const STORAGE_GEMINI_KEY = 'exam_room_gemini_key_v1';
const STORAGE_PROFILE_KEY = 'exam_room_profile_v1';
const STORAGE_ACTION_QUEUE_PREFIX = 'exam_room_queue_v1_';
const BROADCAST_CHANNEL_NAME = 'exam_room_live_channel_v2';
const REACTION_TTL_MS = 6500;
const INVITE_TTL_MS = 1000 * 60 * 15;

const MQTT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];

interface QueuedRoomAction {
  id: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

function getOrCreateLocalMemberId(): string {
  if (typeof window === 'undefined') return 'ssr-member';
  try {
    let existing = window.localStorage.getItem(STORAGE_MEMBER_ID_KEY);
    if (!existing) {
      existing = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      window.localStorage.setItem(STORAGE_MEMBER_ID_KEY, existing);
    }
    return existing;
  } catch {
    return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function loadSavedQueue(code: string): QueuedRoomAction[] {
  if (typeof window === 'undefined' || !code) return [];
  try {
    const raw = window.localStorage.getItem(
      `${STORAGE_ACTION_QUEUE_PREFIX}${code}`
    );
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(code: string, queue: QueuedRoomAction[]) {
  if (typeof window === 'undefined' || !code) return;
  try {
    if (queue.length === 0) {
      window.localStorage.removeItem(`${STORAGE_ACTION_QUEUE_PREFIX}${code}`);
    } else {
      window.localStorage.setItem(
        `${STORAGE_ACTION_QUEUE_PREFIX}${code}`,
        JSON.stringify(queue)
      );
    }
  } catch {
    // Ignore storage quota errors
  }
}

function hasRoomMeaningfullyChanged(
  prev: RoomState | null,
  next: RoomState
): boolean {
  if (!prev) return true;
  if (
    prev.code !== next.code ||
    prev.status !== next.status ||
    prev.mode !== next.mode ||
    prev.title !== next.title ||
    prev.timePerQuestion !== next.timePerQuestion ||
    prev.currentQuestionIndex !== next.currentQuestionIndex ||
    prev.isRevealed !== next.isRevealed ||
    prev.version !== next.version ||
    prev.questionsDigest !== next.questionsDigest ||
    prev.questions.length !== next.questions.length ||
    prev.members.length !== next.members.length ||
    prev.reactions.length !== next.reactions.length
  ) {
    return true;
  }
  if (
    (prev.kickedMemberIds?.length || 0) !== (next.kickedMemberIds?.length || 0)
  ) {
    return true;
  }
  for (let i = 0; i < next.members.length; i++) {
    const a = prev.members[i];
    const b = next.members[i];
    if (
      !a ||
      a.id !== b.id ||
      a.name !== b.name ||
      a.avatar !== b.avatar ||
      a.score !== b.score ||
      Boolean(a.isReady) !== Boolean(b.isReady) ||
      a.statusBadge !== b.statusBadge ||
      (a.readyForNextQuestionIndex ?? -1) !==
        (b.readyForNextQuestionIndex ?? -1) ||
      Object.keys(a.answers).length !== Object.keys(b.answers).length
    ) {
      return true;
    }
  }
  const prevLastRx = prev.reactions[prev.reactions.length - 1]?.id;
  const nextLastRx = next.reactions[next.reactions.length - 1]?.id;
  if (prevLastRx !== nextLastRx) return true;
  return false;
}

export function useRoom(): UseRoomReturn {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [memberId, setMemberId] = useState<string>('');
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string>(
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''
  );
  const [geminiApiKey, setGeminiApiKeyState] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [presenceTick, setPresenceTick] = useState<number>(() => Date.now());

  const [isLocalOffline, setIsLocalOffline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [mqttConnected, setMqttConnected] = useState<boolean>(false);
  const [syncPendingCount, setSyncPendingCount] = useState<number>(0);
  const [wasKicked, setWasKicked] = useState<boolean>(false);
  const [friendPresence, setFriendPresence] = useState<
    Record<string, ConnectionStatus>
  >({});
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >('unsupported');

  const channelRef = useRef<BroadcastChannel | null>(null);
  const mqttClientRef = useRef<MqttClient | null>(null);
  const userMqttClientRef = useRef<MqttClient | null>(null);
  const roomRef = useRef<RoomState | null>(null);
  const accountRef = useRef<UserAccount | null>(null);
  const directoryMapRef = useRef<Map<string, PublicDirectoryUser>>(new Map());
  const questionsCacheRef = useRef<Map<string, Question[]>>(new Map());
  const seenDeltaIdsRef = useRef<Set<string>>(new Set());
  const peerLastSeenRef = useRef<Record<string, number>>({});
  const peerRemoteClockRef = useRef<Record<string, number>>({});
  const peerExplicitStatusRef = useRef<Record<string, ConnectionStatus>>({});
  const actionQueueRef = useRef<QueuedRoomAction[]>([]);
  const pendingOutboundInvitesRef = useRef<
    Array<{ toUsername: string; invite: RoomInvite }>
  >([]);
  const sentInboxCacheRef = useRef<Record<string, RoomInvite[]>>({});
  const flushingQueueRef = useRef<boolean>(false);
  const syncStartedAtRef = useRef<number>(0);
  const lastLocalMutationAtRef = useRef<number>(0);
  const mountedAtRef = useRef<number>(Date.now());
  const seenReactionIdsRef = useRef<Set<string>>(new Set());
  const seenInviteIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    unlockAudio();
    const id = getOrCreateLocalMemberId();
    setMemberId(id);

    if (typeof window !== 'undefined') {
      if ('Notification' in window) {
        setNotificationPermission(Notification.permission);
      } else {
        setNotificationPermission('unsupported');
      }
    }

    try {
      const savedAcc = window.localStorage.getItem(STORAGE_ACCOUNT_KEY);
      if (savedAcc) {
        const parsed = JSON.parse(savedAcc) as UserAccount;
        if (parsed?.email && parsed?.username && parsed?.googleVerified) {
          setAccount(parsed);
          accountRef.current = parsed;
          if (parsed.geminiApiKey) {
            setGeminiApiKeyState(parsed.geminiApiKey);
            window.localStorage.setItem(STORAGE_GEMINI_KEY, parsed.geminiApiKey);
          }
        }
      }
      const savedGeminiKey = window.localStorage.getItem(STORAGE_GEMINI_KEY);
      if (savedGeminiKey) {
        setGeminiApiKeyState(savedGeminiKey);
      }
      const savedCid = window.localStorage.getItem(STORAGE_GOOGLE_CLIENT_ID_KEY);
      if (savedCid && !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
        setGoogleClientId(savedCid);
      }
    } catch {
      // Ignore storage read errors
    }

    fetch('/api/accounts', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.googleClientId) {
          setGoogleClientId(data.googleClientId);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    roomRef.current = room;
    if (room?.questions && room.questions.length > 0) {
      const digest =
        room.questionsDigest || computeQuestionsDigest(room.questions);
      questionsCacheRef.current.set(digest, room.questions);
    }
  }, [room]);

  useEffect(() => {
    accountRef.current = account;
    if (typeof window !== 'undefined') {
      try {
        if (account) {
          window.localStorage.setItem(STORAGE_ACCOUNT_KEY, JSON.stringify(account));
        } else {
          window.localStorage.removeItem(STORAGE_ACCOUNT_KEY);
        }
      } catch {
        // Ignore storage write errors
      }
    }
  }, [account]);

  // Listen to browser online/offline network transitions
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => {
      setIsLocalOffline(false);
    };
    const handleOffline = () => {
      setIsLocalOffline(true);
      const client = mqttClientRef.current;
      const code = roomRef.current?.code;
      const activeMemberId = memberId || getOrCreateLocalMemberId();
      if (client && client.connected && code) {
        try {
          client.publish(
            `examroom/v2/${code}/presence`,
            JSON.stringify({
              m: activeMemberId,
              status: 'offline',
              ts: Date.now(),
            }),
            { qos: 0, retain: false }
          );
        } catch {
          // Ignore
        }
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [memberId]);

  // Tick every 1s only when active floating reactions exist, and every 5s for presence status refresh
  useEffect(() => {
    const rxTimer = setInterval(() => {
      const reactions = roomRef.current?.reactions;
      if (reactions && reactions.length > 0) {
        const now = Date.now();
        const hasRecent = reactions.some(
          (rx) => now - rx.createdAt < REACTION_TTL_MS + 1200
        );
        if (hasRecent) {
          setNowTick(now);
        }
      }
    }, 1000);

    const presenceTimer = setInterval(() => {
      if (roomRef.current?.code) {
        setPresenceTick(Date.now());
      }
    }, 5000);

    return () => {
      clearInterval(rxTimer);
      clearInterval(presenceTimer);
    };
  }, []);

  const hydrateRoomQuestions = useCallback((incoming: RoomState): RoomState => {
    if (incoming.questions && incoming.questions.length > 0) {
      const digest =
        incoming.questionsDigest || computeQuestionsDigest(incoming.questions);
      questionsCacheRef.current.set(digest, incoming.questions);
      return { ...incoming, questionsDigest: digest };
    }
    if (incoming.questionsDigest) {
      const cached = questionsCacheRef.current.get(incoming.questionsDigest);
      if (cached && cached.length > 0) {
        return { ...incoming, questions: cached };
      }
    }
    if (
      roomRef.current &&
      roomRef.current.code === incoming.code &&
      roomRef.current.questions.length > 0 &&
      (!incoming.questionsDigest ||
        incoming.questionsDigest === roomRef.current.questionsDigest)
    ) {
      return { ...incoming, questions: roomRef.current.questions };
    }
    return incoming;
  }, []);

  const makeCompactRoom = useCallback(
    (fullRoom: RoomState): CompactRoomState & { questions: Question[] } => {
      const digest =
        fullRoom.questionsDigest ||
        computeQuestionsDigest(fullRoom.questions || []);
      return {
        ...fullRoom,
        questionsDigest: digest,
        questionCount: fullRoom.questions?.length || 0,
        questions: [],
      };
    },
    []
  );

  const handlePossibleKick = useCallback(
    (nextRoom: RoomState): boolean => {
      const activeMemberId = memberId || getOrCreateLocalMemberId();
      if (
        activeMemberId &&
        nextRoom.kickedMemberIds?.includes(activeMemberId)
      ) {
        if (mqttClientRef.current) {
          try {
            mqttClientRef.current.end(true);
          } catch {
            // Ignore
          }
          mqttClientRef.current = null;
        }
        setMqttConnected(false);
        roomRef.current = null;
        setRoom(null);
        setWasKicked(true);
        setError('You were removed from the room by the host.');
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.removeItem(STORAGE_ACTIVE_ROOM_KEY);
          } catch {
            // Ignore
          }
        }
        return true;
      }
      return false;
    },
    [memberId]
  );

  const publishMqttState = useCallback(
    (stateToPublish: RoomState, includeQuestions = false) => {
      const client = mqttClientRef.current;
      if (!client || !client.connected || !stateToPublish?.code) return;
      try {
        const digest =
          stateToPublish.questionsDigest ||
          computeQuestionsDigest(stateToPublish.questions || []);

        if (includeQuestions && stateToPublish.questions?.length > 0) {
          client.publish(
            `examroom/v2/${stateToPublish.code}/questions`,
            JSON.stringify({
              digest,
              questionsUpdatedAt: stateToPublish.questionsUpdatedAt || Date.now(),
              questions: stateToPublish.questions,
            }),
            { qos: 1, retain: true }
          );
        }

        const stateTopic = `examroom/v2/${stateToPublish.code}/state`;
        const payloadObj = makeCompactRoom({
          ...stateToPublish,
          questionsDigest: digest,
        });
        client.publish(stateTopic, JSON.stringify(payloadObj), {
          qos: 1,
          retain: true,
        });
      } catch {
        // Ignore MQTT publish errors
      }
    },
    [makeCompactRoom]
  );

  const publishMqttDelta = useCallback((code: string, delta: RoomDelta) => {
    const client = mqttClientRef.current;
    if (!client || !client.connected || !code) return;
    try {
      client.publish(`examroom/v2/${code}/delta`, JSON.stringify(delta), {
        qos: 1,
        retain: false,
      });
    } catch {
      // Ignore MQTT delta publish errors
    }
  }, []);

  const commitRoomState = useCallback(
    (nextRoom: RoomState | null, options?: { publishMqtt?: boolean; includeQuestions?: boolean }) => {
      if (!nextRoom) {
        roomRef.current = null;
        setRoom(null);
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.removeItem(STORAGE_ACTIVE_ROOM_KEY);
          } catch {
            // Ignore
          }
        }
        return;
      }

      const hydrated = hydrateRoomQuestions(nextRoom);
      if (handlePossibleKick(hydrated)) {
        return;
      }

      const prev = roomRef.current;
      const merged =
        prev && prev.code === hydrated.code
          ? mergeRoomStates(prev, hydrated)
          : hydrated;

      if (handlePossibleKick(merged)) {
        return;
      }

      roomRef.current = merged;

      // Record local receive timestamp whenever a member is first seen or their remote clock advances
      const localNow = Date.now();
      for (const m of merged.members || []) {
        if (!peerLastSeenRef.current[m.id]) {
          peerLastSeenRef.current[m.id] = localNow;
          peerRemoteClockRef.current[m.id] = m.lastSeenAt || 0;
          peerExplicitStatusRef.current[m.id] = 'online';
        } else if (
          m.lastSeenAt &&
          m.lastSeenAt > (peerRemoteClockRef.current[m.id] || 0)
        ) {
          peerRemoteClockRef.current[m.id] = m.lastSeenAt;
          peerLastSeenRef.current[m.id] = localNow;
          peerExplicitStatusRef.current[m.id] = 'online';
        }
      }

      if (hasRoomMeaningfullyChanged(prev, merged)) {
        // Sound when a new peer reaction arrives after mount
        const activeMemberId = memberId || getOrCreateLocalMemberId();
        for (const rx of merged.reactions || []) {
          if (!seenReactionIdsRef.current.has(rx.id)) {
            seenReactionIdsRef.current.add(rx.id);
            if (
              rx.senderId !== activeMemberId &&
              rx.createdAt > mountedAtRef.current
            ) {
              playReactionSound();
            }
          }
        }
        if (seenReactionIdsRef.current.size > 200) {
          seenReactionIdsRef.current = new Set(
            Array.from(seenReactionIdsRef.current).slice(-100)
          );
        }
        setRoom(merged);
      }

      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(STORAGE_ACTIVE_ROOM_KEY, merged.code);
          channelRef.current?.postMessage(merged);
        } catch {
          // Ignore
        }
      }
      if (options?.publishMqtt) {
        publishMqttState(merged, options.includeQuestions);
      }
    },
    [memberId, hydrateRoomQuestions, handlePossibleKick, publishMqttState]
  );

  const applyDeltaToRoom = useCallback(
    (delta: RoomDelta) => {
      if (!roomRef.current) return;
      if ('id' in delta && delta.id) {
        if (seenDeltaIdsRef.current.has(delta.id)) return;
        seenDeltaIdsRef.current.add(delta.id);
        if (seenDeltaIdsRef.current.size > 300) {
          const arr = Array.from(seenDeltaIdsRef.current).slice(-150);
          seenDeltaIdsRef.current = new Set(arr);
        }
      }

      const current = roomRef.current;
      const now = Date.now();
      let updated: RoomState | null = null;

      if (delta.t === 'hb') {
        peerLastSeenRef.current[delta.m] = now;
        peerExplicitStatusRef.current[delta.m] = delta.status;
        setPresenceTick(now);
        return;
      }

      if ('m' in delta && delta.m) {
        peerLastSeenRef.current[delta.m] = now;
        peerExplicitStatusRef.current[delta.m] = 'online';
      }

      switch (delta.t) {
        case 'ready': {
          if (current.status !== 'lobby') return;
          const nextMembers = current.members.map((m) =>
            m.id === delta.m
              ? { ...m, isReady: delta.r, lastSeenAt: delta.ts }
              : m
          );
          const allReady =
            nextMembers.length >= 2 &&
            current.questions.length > 0 &&
            nextMembers.every((m) => Boolean(m.isReady));

          updated = {
            ...current,
            status: allReady ? 'active' : current.status,
            currentQuestionIndex: allReady ? 0 : current.currentQuestionIndex,
            questionStartedAt: allReady ? delta.ts : current.questionStartedAt,
            examSessionId: allReady ? delta.ts : current.examSessionId,
            members: allReady
              ? nextMembers.map((m) => ({
                  ...m,
                  isReady: false,
                  readyForNextQuestionIndex: -1,
                  score: 0,
                  streak: 0,
                  bestStreak: 0,
                  correctCount: 0,
                  totalTimeMs: 0,
                  answers: {},
                }))
              : nextMembers,
            version: current.version + 1,
            updatedAt: Math.max(current.updatedAt, delta.ts),
          };
          break;
        }

        case 'ans': {
          if (current.status !== 'active' || delta.q !== current.currentQuestionIndex) {
            return;
          }
          const qObj = current.questions[delta.q];
          if (!qObj) return;
          const targetMember = current.members.find((m) => m.id === delta.m);
          if (!targetMember || targetMember.answers[delta.q] !== undefined) {
            return;
          }
          const safeOpt = Math.max(
            0,
            Math.min(qObj.options.length - 1, delta.o)
          );
          const timeMs = Math.max(250, delta.ts - current.questionStartedAt);
          const isCorrect = safeOpt === qObj.correctIndex;
          const { pointsEarned, speedBonus } = computePoints(
            current,
            targetMember,
            isCorrect,
            timeMs,
            delta.q
          );
          const newAns: MemberAnswer = {
            questionIndex: delta.q,
            optionIndex: safeOpt,
            answeredAt: delta.ts,
            timeMs,
            isCorrect,
            pointsEarned,
            speedBonus,
          };
          const nextMembers = current.members.map((m) => {
            if (m.id !== delta.m) return m;
            return {
              ...m,
              score: isCorrect ? m.score + pointsEarned : m.score,
              streak: isCorrect ? m.streak + 1 : 0,
              bestStreak: isCorrect
                ? Math.max(m.bestStreak, m.streak + 1)
                : m.bestStreak,
              correctCount: isCorrect ? m.correctCount + 1 : m.correctCount,
              totalTimeMs: m.totalTimeMs + timeMs,
              lastSeenAt: delta.ts,
              answers: { ...m.answers, [delta.q]: newAns },
            };
          });
          const allAnswered =
            nextMembers.length > 0 &&
            nextMembers.every((m) => m.answers[delta.q] !== undefined);
          updated = {
            ...current,
            members: nextMembers,
            isRevealed: allAnswered,
            version: current.version + 1,
            updatedAt: Math.max(current.updatedAt, delta.ts),
          };
          break;
        }

        case 'next': {
          if (current.status !== 'active' || delta.q !== current.currentQuestionIndex) {
            return;
          }
          const nextMembers = current.members.map((m) =>
            m.id === delta.m
              ? {
                  ...m,
                  readyForNextQuestionIndex: Math.max(
                    m.readyForNextQuestionIndex ?? -1,
                    delta.q
                  ),
                  lastSeenAt: delta.ts,
                }
              : m
          );
          const allNextReady =
            nextMembers.length > 0 &&
            nextMembers.every(
              (m) => (m.readyForNextQuestionIndex ?? -1) >= delta.q
            );

          let nextIdx = current.currentQuestionIndex;
          let nextStatus: RoomState['status'] = current.status;
          let nextStartedAt = current.questionStartedAt;
          let nextRevealed = current.isRevealed;

          if (allNextReady) {
            if (current.currentQuestionIndex + 1 < current.questions.length) {
              nextIdx += 1;
              nextStartedAt = delta.ts;
              nextRevealed = false;
            } else {
              nextStatus = 'finished';
              nextRevealed = true;
            }
          }

          updated = {
            ...current,
            status: nextStatus,
            currentQuestionIndex: nextIdx,
            questionStartedAt: nextStartedAt,
            isRevealed: nextRevealed,
            members: nextMembers,
            version: current.version + 1,
            updatedAt: Math.max(current.updatedAt, delta.ts),
          };
          break;
        }

        case 'rx': {
          if (current.reactions.some((r) => r.id === delta.rx.id)) return;
          updated = {
            ...current,
            reactions: [...current.reactions, delta.rx].slice(-40),
            version: current.version + 1,
            updatedAt: Math.max(current.updatedAt, delta.ts),
          };
          break;
        }

        case 'badge': {
          updated = {
            ...current,
            members: current.members.map((m) =>
              m.id === delta.m
                ? { ...m, statusBadge: delta.b, lastSeenAt: delta.ts }
                : m
            ),
            version: current.version + 1,
            updatedAt: Math.max(current.updatedAt, delta.ts),
          };
          break;
        }

        case 'prof': {
          updated = {
            ...current,
            members: current.members.map((m) => {
              if (m.id !== delta.m) return m;
              return {
                ...m,
                name: delta.name || m.name,
                avatar: delta.avatar || m.avatar,
                username: delta.username || m.username,
                lastSeenAt: delta.ts,
              };
            }),
            version: current.version + 1,
            updatedAt: Math.max(current.updatedAt, delta.ts),
          };
          break;
        }

        case 'kick': {
          const nextKicked = Array.from(
            new Set([...(current.kickedMemberIds || []), delta.target])
          );
          const nextMembers = current.members.filter(
            (m) => m.id !== delta.target
          );
          const qIdx = current.currentQuestionIndex;
          const allAns =
            nextMembers.length > 0 &&
            nextMembers.every((m) => m.answers[qIdx] !== undefined);
          updated = {
            ...current,
            kickedMemberIds: nextKicked,
            members: nextMembers,
            isRevealed:
              current.status === 'active' ? allAns : current.isRevealed,
            version: current.version + 1,
            updatedAt: Math.max(current.updatedAt, delta.ts),
          };
          break;
        }
      }

      if (updated) {
        commitRoomState(updated, { publishMqtt: false });
      }
    },
    [commitRoomState]
  );

  // Offline-resilient HTTP action queue flusher
  const flushActionQueue = useCallback(async () => {
    const code = roomRef.current?.code;
    if (!code || flushingQueueRef.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (actionQueueRef.current.length === 0) return;

    flushingQueueRef.current = true;
    const activeMemberId = memberId || getOrCreateLocalMemberId();

    try {
      while (actionQueueRef.current.length > 0) {
        const item = actionQueueRef.current[0];
        const currentRoom = roomRef.current;
        if (!currentRoom || currentRoom.code !== code) break;

        let attempt = 0;
        let succeeded = false;
        const backoffs = [600, 1500, 3000];

        while (attempt <= backoffs.length) {
          try {
            const sendFallback =
              item.action === 'setQuestions'
                ? currentRoom
                : makeCompactRoom(currentRoom);

            const res = await fetch(
              `/api/rooms/${encodeURIComponent(code)}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: item.action,
                  memberId: activeMemberId,
                  fallbackRoom: sendFallback,
                  knownQuestionsDigest:
                    currentRoom.questionsDigest ||
                    computeQuestionsDigest(currentRoom.questions || []),
                  ...item.payload,
                }),
              }
            );
            const data = await res.json();
            if (res.ok && data?.room) {
              succeeded = true;
              if (lastLocalMutationAtRef.current <= item.createdAt) {
                commitRoomState(data.room, {
                  publishMqtt: true,
                  includeQuestions: item.action === 'setQuestions',
                });
              }
              break;
            } else if (res.status >= 400 && res.status < 500) {
              // Deterministic 4xx (not transient) — drop from queue
              if (data?.error) setError(data.error);
              succeeded = true;
              break;
            }
          } catch {
            // Network error — retry with backoff
          }

          if (attempt < backoffs.length) {
            await new Promise((r) => setTimeout(r, backoffs[attempt]));
          }
          attempt++;
        }

        if (succeeded) {
          actionQueueRef.current.shift();
          saveQueue(code, actionQueueRef.current);
          setSyncPendingCount(actionQueueRef.current.length);
        } else {
          // Still offline / unreachable — pause flushing until next online/MQTT event
          break;
        }
      }
    } finally {
      flushingQueueRef.current = false;
    }
  }, [memberId, makeCompactRoom, commitRoomState]);

  const enqueueRoomAction = useCallback(
    (action: string, payload: Record<string, unknown> = {}) => {
      const code = roomRef.current?.code;
      if (!code) return;
      const item: QueuedRoomAction = {
        id: `qa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        action,
        payload,
        createdAt: Date.now(),
      };
      actionQueueRef.current.push(item);
      saveQueue(code, actionQueueRef.current);
      setSyncPendingCount(actionQueueRef.current.length);
      void flushActionQueue();
    },
    [flushActionQueue]
  );

  // Setup BroadcastChannel for instant same-browser tab sync
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
      return;
    }
    const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    channelRef.current = bc;

    bc.onmessage = (event) => {
      const incoming = event.data as RoomState | undefined;
      if (incoming && incoming.code && incoming.code === roomRef.current?.code) {
        commitRoomState(incoming, { publishMqtt: false });
      }
    };

    return () => {
      bc.close();
      channelRef.current = null;
    };
  }, [commitRoomState]);

  const triggerInviteNotification = useCallback(
    async (invite: RoomInvite) => {
      if (typeof window === 'undefined') return;
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([80, 40, 100]);
        } catch {
          // Ignore
        }
      }
      if (!('Notification' in window) || Notification.permission !== 'granted') {
        return;
      }

      const title = `${invite.fromAvatar} ${invite.fromName} invited you!`;
      const targetUrl = `/?room=${encodeURIComponent(invite.roomCode)}`;
      const options: NotificationOptions & { requireInteraction?: boolean } = {
        body: `Join "${invite.roomTitle}" (Room ${invite.roomCode})`,
        icon: '/api/pwa-icon?size=192',
        tag: `invite-${invite.roomCode}`,
        data: {
          url: targetUrl,
          roomCode: invite.roomCode,
          inviteId: invite.id,
        },
        requireInteraction: true,
      };

      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready;
          if (reg && typeof reg.showNotification === 'function') {
            await reg.showNotification(title, options);
            return;
          }
        }
        const notif = new Notification(title, options);
        notif.onclick = () => {
          try {
            window.focus();
            window.dispatchEvent(
              new CustomEvent('exam:open-room-invite', {
                detail: { roomCode: invite.roomCode, inviteId: invite.id },
              })
            );
            notif.close();
          } catch {
            // Ignore
          }
        };
      } catch {
        // Ignore notification errors on unsupported webviews
      }
    },
    []
  );

  const requestNotificationPermission = useCallback(async (): Promise<
    NotificationPermission | 'unsupported'
  > => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      return perm;
    } catch {
      return Notification.permission;
    }
  }, []);

  const publishInviteOverMqtt = useCallback(
    (
      client: MqttClient | null,
      toUsername: string,
      invite: RoomInvite,
      explicitInbox?: RoomInvite[]
    ): boolean => {
      if (!client || !client.connected) return false;
      const cleanTo = toUsername.trim().replace(/^@+/, '').toLowerCase();
      if (!cleanTo) return false;
      try {
        const inviteTopic = `examroom/v2/user/${encodeURIComponent(
          cleanTo
        )}/invites`;
        client.publish(inviteTopic, JSON.stringify(invite), {
          qos: 1,
          retain: false,
        });

        const prevCached = sentInboxCacheRef.current[cleanTo] || [];
        const baseList = explicitInbox
          ? [...explicitInbox, ...prevCached]
          : [invite, ...prevCached];
        const deduped = new Map<string, RoomInvite>();
        const now = Date.now();
        for (const item of baseList) {
          if (item?.id && now - item.createdAt <= INVITE_TTL_MS) {
            deduped.set(item.id, item);
          }
        }
        const mergedInbox = Array.from(deduped.values())
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 20);
        sentInboxCacheRef.current[cleanTo] = mergedInbox;

        const inboxTopic = `examroom/v2/user/${encodeURIComponent(
          cleanTo
        )}/inbox`;
        client.publish(inboxTopic, JSON.stringify(mergedInbox), {
          qos: 1,
          retain: true,
        });
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  const flushPendingOutboundInvites = useCallback(
    (client: MqttClient | null) => {
      if (!client || !client.connected) return;
      if (pendingOutboundInvitesRef.current.length === 0) return;
      const remaining: Array<{ toUsername: string; invite: RoomInvite }> = [];
      for (const item of pendingOutboundInvitesRef.current) {
        const ok = publishInviteOverMqtt(client, item.toUsername, item.invite);
        if (!ok) remaining.push(item);
      }
      pendingOutboundInvitesRef.current = remaining;
    },
    [publishInviteOverMqtt]
  );

  // Global MQTT user directory + reliable retained inbox + live invites + friend presence listener
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;
    const username = account?.username?.toLowerCase();
    const inviteTopic = username
      ? `examroom/v2/user/${encodeURIComponent(username)}/invites`
      : null;
    const inboxTopic = username
      ? `examroom/v2/user/${encodeURIComponent(username)}/inbox`
      : null;
    const myPresenceTopic = username
      ? `examroom/v2/user/${encodeURIComponent(username)}/presence`
      : null;
    const directoryWildcard = 'examroom/v2/directory/+';
    const friendPresenceTopics = (account?.friends || [])
      .map((f) => f.username?.toLowerCase())
      .filter((u): u is string => Boolean(u))
      .map((u) => `examroom/v2/user/${encodeURIComponent(u)}/presence`);

    const client = mqtt.connect(MQTT_BROKERS[0], {
      clientId: `usr-${Math.random().toString(36).slice(2, 10)}`,
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 2000,
      keepalive: 15,
      ...(myPresenceTopic && username
        ? {
            will: {
              topic: myPresenceTopic,
              payload: JSON.stringify({
                u: username,
                status: 'offline',
                ts: Date.now(),
              }),
              qos: 1,
              retain: true,
            },
          }
        : {}),
    });
    userMqttClientRef.current = client;

    const publishMyUserPresence = (status: ConnectionStatus) => {
      if (!client.connected || !myPresenceTopic || !username) return;
      try {
        client.publish(
          myPresenceTopic,
          JSON.stringify({ u: username, status, ts: Date.now() }),
          { qos: 1, retain: true }
        );
      } catch {
        // Ignore
      }
    };

    client.on('connect', () => {
      if (cancelled) return;
      const topics = [directoryWildcard, ...friendPresenceTopics];
      if (inviteTopic) topics.push(inviteTopic);
      if (inboxTopic) topics.push(inboxTopic);
      client.subscribe(topics, { qos: 1 });

      if (account?.username && account?.email) {
        const dirTopic = `examroom/v2/directory/${account.username.toLowerCase()}`;
        const dirEntry: PublicDirectoryUser = {
          username: account.username.toLowerCase(),
          name: account.name,
          avatar: account.avatar,
          pictureUrl: account.pictureUrl,
          email: account.email,
        };
        client.publish(dirTopic, JSON.stringify(dirEntry), {
          qos: 1,
          retain: true,
        });
      }

      publishMyUserPresence(
        typeof navigator !== 'undefined' && !navigator.onLine
          ? 'offline'
          : 'online'
      );
      flushPendingOutboundInvites(client);
    });

    const mergeIncomingInvites = (incomingList: RoomInvite[]) => {
      const now = Date.now();
      const validIncoming = incomingList.filter(
        (i) => i?.id && i?.roomCode && now - i.createdAt <= INVITE_TTL_MS
      );
      if (validIncoming.length === 0) return;

      setAccount((prev) => {
        if (!prev) return prev;
        const map = new Map<string, RoomInvite>();
        for (const oldInv of prev.invites || []) {
          if (now - oldInv.createdAt <= INVITE_TTL_MS) {
            map.set(oldInv.id, oldInv);
          }
        }
        let addedNew: RoomInvite | null = null;
        for (const inc of validIncoming) {
          if (!map.has(inc.id)) {
            addedNew = inc;
          }
          map.set(inc.id, inc);
        }
        if (addedNew && !seenInviteIdsRef.current.has(addedNew.id)) {
          seenInviteIdsRef.current.add(addedNew.id);
          playNotificationSound();
          void triggerInviteNotification(addedNew);
        }
        const mergedInvites = Array.from(map.values()).sort(
          (a, b) => b.createdAt - a.createdAt
        );
        if (
          mergedInvites.length === prev.invites.length &&
          mergedInvites[0]?.id === prev.invites[0]?.id
        ) {
          return prev;
        }
        return {
          ...prev,
          invites: mergedInvites,
          updatedAt: now,
        };
      });
    };

    client.on('message', (topic, payload) => {
      if (cancelled) return;
      try {
        if (topic.startsWith('examroom/v2/directory/')) {
          const entry = JSON.parse(payload.toString()) as PublicDirectoryUser;
          if (entry?.username) {
            directoryMapRef.current.set(entry.username.toLowerCase(), entry);
          }
          return;
        }

        if (topic.startsWith('examroom/v2/user/') && topic.endsWith('/presence')) {
          const pres = JSON.parse(payload.toString()) as {
            u?: string;
            status?: ConnectionStatus;
          };
          if (pres?.u && pres?.status) {
            const key = pres.u.toLowerCase();
            setFriendPresence((prev) =>
              prev[key] === pres.status
                ? prev
                : { ...prev, [key]: pres.status! }
            );
          }
          return;
        }

        if (inboxTopic && topic === inboxTopic) {
          const parsed = JSON.parse(payload.toString());
          if (Array.isArray(parsed)) {
            mergeIncomingInvites(parsed as RoomInvite[]);
          }
          return;
        }

        if (inviteTopic && topic === inviteTopic) {
          const invite = JSON.parse(payload.toString()) as RoomInvite;
          if (invite?.id && invite?.roomCode) {
            mergeIncomingInvites([invite]);
          }
        }
      } catch {
        // Ignore
      }
    });

    const syncAccount = async () => {
      if (!accountRef.current?.email) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const res = await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'sync',
            email: accountRef.current.email,
            account: accountRef.current,
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.account) {
          const nextAcc = data.account as UserAccount;
          const prevIds = new Set(
            (accountRef.current?.invites || []).map((i) => i.id)
          );
          const freshInvites = (nextAcc.invites || []).filter(
            (inv) =>
              !prevIds.has(inv.id) &&
              !seenInviteIdsRef.current.has(inv.id) &&
              inv.createdAt > mountedAtRef.current - 60000
          );
          if (freshInvites.length > 0) {
            for (const inv of freshInvites) {
              seenInviteIdsRef.current.add(inv.id);
            }
            playNotificationSound();
            void triggerInviteNotification(freshInvites[0]);
          }
          setAccount(nextAcc);
        }
      } catch {
        // Ignore
      }
    };

    if (account?.email) {
      syncAccount();
    }
    const interval = setInterval(() => {
      void syncAccount();
      publishMyUserPresence(
        typeof navigator !== 'undefined' && !navigator.onLine
          ? 'offline'
          : 'online'
      );
    }, 15000);

    const accountSyncInterval = setInterval(syncAccount, 5000);

    const onWake = () => {
      if (!document.hidden && accountRef.current?.email) {
        publishMyUserPresence('online');
        void syncAccount();
      }
    };
    const onOnline = () => {
      if (accountRef.current?.email) {
        publishMyUserPresence('online');
        void syncAccount();
      }
    };
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onWake);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearInterval(accountSyncInterval);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onWake);
      try {
        publishMyUserPresence('offline');
        client.end(true);
      } catch {
        // Ignore
      }
      userMqttClientRef.current = null;
    };
  }, [
    account?.username,
    account?.email,
    account?.name,
    account?.avatar,
    account?.pictureUrl,
    account?.friends,
    triggerInviteNotification,
    flushPendingOutboundInvites,
  ]);

  // Real-time MQTT over WebSockets for Room: delta + state + questions + presence + LWT
  useEffect(() => {
    const code = room?.code;
    if (!code || typeof window === 'undefined') return;

    actionQueueRef.current = loadSavedQueue(code);
    setSyncPendingCount(actionQueueRef.current.length);

    let brokerIdx = 0;
    let isCancelled = false;
    const activeMemberId = memberId || getOrCreateLocalMemberId();
    const stateTopic = `examroom/v2/${code}/state`;
    const questionsTopic = `examroom/v2/${code}/questions`;
    const deltaTopic = `examroom/v2/${code}/delta`;
    const presenceTopic = `examroom/v2/${code}/presence`;
    const pingTopic = `examroom/v2/${code}/ping`;

    const connectBroker = (url: string) => {
      const client = mqtt.connect(url, {
        clientId: `exam-${code}-${Math.random().toString(36).slice(2, 9)}`,
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 1500,
        keepalive: 15,
        will: {
          topic: presenceTopic,
          payload: JSON.stringify({
            m: activeMemberId,
            status: 'offline',
            ts: Date.now(),
          }),
          qos: 1,
          retain: false,
        },
      });

      mqttClientRef.current = client;

      client.on('connect', () => {
        if (isCancelled) return;
        setMqttConnected(true);
        setIsLocalOffline(false);

        client.subscribe(
          [stateTopic, questionsTopic, deltaTopic, presenceTopic, pingTopic],
          { qos: 1 },
          () => {
            // Announce presence online immediately
            client.publish(
              presenceTopic,
              JSON.stringify({
                m: activeMemberId,
                status: 'online',
                ts: Date.now(),
              }),
              { qos: 0, retain: false }
            );

            if (roomRef.current && roomRef.current.code === code) {
              if (roomRef.current.hostId !== '') {
                publishMqttState(
                  roomRef.current,
                  roomRef.current.questions.length > 0
                );
              }
              client.publish(
                pingTopic,
                JSON.stringify({
                  sender: activeMemberId,
                  ts: Date.now(),
                }),
                { qos: 0, retain: false }
              );
            }
            flushPendingOutboundInvites(client);
            void flushActionQueue();
          }
        );
      });

      client.on('offline', () => {
        if (!isCancelled) setMqttConnected(false);
      });

      client.on('close', () => {
        if (!isCancelled) setMqttConnected(false);
      });

      client.on('message', (topic, payload) => {
        if (isCancelled) return;
        try {
          if (topic === presenceTopic) {
            const p = JSON.parse(payload.toString()) as {
              m: string;
              status: ConnectionStatus;
              ts: number;
            };
            if (p?.m) {
              // Always record local receive time (never remote clock p.ts!) to avoid clock skew
              peerLastSeenRef.current[p.m] = Date.now();
              peerExplicitStatusRef.current[p.m] = p.status || 'online';
              setPresenceTick(Date.now());
            }
            return;
          }

          if (topic === deltaTopic) {
            const delta = JSON.parse(payload.toString()) as RoomDelta;
            if (delta && delta.t) {
              applyDeltaToRoom(delta);
            }
            return;
          }

          if (topic === questionsTopic) {
            const qPack = JSON.parse(payload.toString()) as {
              digest: string;
              questionsUpdatedAt?: number;
              questions: Question[];
            };
            if (
              qPack?.digest &&
              Array.isArray(qPack.questions) &&
              qPack.questions.length > 0
            ) {
              questionsCacheRef.current.set(qPack.digest, qPack.questions);
              if (
                roomRef.current &&
                roomRef.current.code === code &&
                roomRef.current.questions.length === 0
              ) {
                commitRoomState(
                  {
                    ...roomRef.current,
                    questions: qPack.questions,
                    questionsDigest: qPack.digest,
                    questionsUpdatedAt:
                      qPack.questionsUpdatedAt || Date.now(),
                  },
                  { publishMqtt: false }
                );
              }
            }
            return;
          }

          if (topic === pingTopic) {
            const pingData = JSON.parse(payload.toString());
            if (
              pingData?.sender !== activeMemberId &&
              roomRef.current &&
              roomRef.current.code === code &&
              roomRef.current.hostId !== ''
            ) {
              publishMqttState(
                roomRef.current,
                roomRef.current.questions.length > 0
              );
            }
            return;
          }

          if (topic === stateTopic) {
            const incomingRaw = JSON.parse(payload.toString()) as RoomState;
            if (!incomingRaw || incomingRaw.code !== code) return;

            const prevCount = roomRef.current?.members.length || 0;
            commitRoomState(incomingRaw, { publishMqtt: false });

            if (
              roomRef.current &&
              roomRef.current.hostId !== '' &&
              (roomRef.current.members.length >
                (incomingRaw.members?.length || 0) ||
                roomRef.current.members.length > prevCount)
            ) {
              publishMqttState(roomRef.current, false);
            }
          }
        } catch {
          // Ignore malformed MQTT messages
        }
      });

      client.on('error', () => {
        if (isCancelled) return;
        setMqttConnected(false);
        if (brokerIdx === 0 && MQTT_BROKERS.length > 1) {
          brokerIdx = 1;
          try {
            client.end(true);
          } catch {
            // Ignore
          }
          connectBroker(MQTT_BROKERS[1]);
        }
      });
    };

    connectBroker(MQTT_BROKERS[0]);

    // 4s Presence Heartbeat over MQTT
    const hbInterval = setInterval(() => {
      if (
        mqttClientRef.current &&
        mqttClientRef.current.connected &&
        typeof document !== 'undefined' &&
        !document.hidden
      ) {
        try {
          mqttClientRef.current.publish(
            presenceTopic,
            JSON.stringify({
              m: activeMemberId,
              status: navigator.onLine ? 'online' : 'offline',
              ts: Date.now(),
            }),
            { qos: 0, retain: false }
          );
        } catch {
          // Ignore
        }
      }
    }, 4000);

    const handleRoomOnlineWake = () => {
      if (
        mqttClientRef.current &&
        mqttClientRef.current.connected &&
        typeof document !== 'undefined' &&
        !document.hidden
      ) {
        try {
          mqttClientRef.current.publish(
            presenceTopic,
            JSON.stringify({
              m: activeMemberId,
              status: navigator.onLine ? 'online' : 'offline',
              ts: Date.now(),
            }),
            { qos: 0, retain: false }
          );
        } catch {
          // Ignore
        }
      }
    };

    window.addEventListener('online', handleRoomOnlineWake);
    document.addEventListener('visibilitychange', handleRoomOnlineWake);

    return () => {
      isCancelled = true;
      clearInterval(hbInterval);
      window.removeEventListener('online', handleRoomOnlineWake);
      document.removeEventListener('visibilitychange', handleRoomOnlineWake);
      setMqttConnected(false);
      if (mqttClientRef.current) {
        try {
          mqttClientRef.current.end(true);
        } catch {
          // Ignore
        }
        mqttClientRef.current = null;
      }
    };
  }, [
    room?.code,
    memberId,
    publishMqttState,
    applyDeltaToRoom,
    commitRoomState,
    flushActionQueue,
    flushPendingOutboundInvites,
  ]);

  // Adaptive, visibility-aware HTTP sync (2.5s when MQTT connected, 1s when disconnected, paused when hidden)
  useEffect(() => {
    if (!room?.code) return;
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    const code = room.code;

    const syncWithServer = async () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        timerId = setTimeout(syncWithServer, 2000);
        return;
      }

      const requestStartedAt = Date.now();
      syncStartedAtRef.current = requestStartedAt;

      try {
        const currentRoom = roomRef.current;
        const activeMemberId = memberId || getOrCreateLocalMemberId();
        const knownDigest =
          currentRoom?.questionsDigest ||
          (currentRoom?.questions?.length
            ? computeQuestionsDigest(currentRoom.questions)
            : '');

        const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            action: 'sync',
            memberId: activeMemberId,
            knownQuestionsDigest: knownDigest,
            includeQuestions:
              !currentRoom?.questions || currentRoom.questions.length === 0,
            fallbackRoom: currentRoom ? makeCompactRoom(currentRoom) : undefined,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (
            !cancelled &&
            data?.room &&
            lastLocalMutationAtRef.current <= requestStartedAt
          ) {
            commitRoomState(data.room, { publishMqtt: false });
          }
        }
      } catch {
        // Ignore transient network errors
      } finally {
        if (!cancelled) {
          const delay = mqttConnected ? 2500 : 1000;
          timerId = setTimeout(syncWithServer, delay);
        }
      }
    };

    const handleWakeUp = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (timerId) clearTimeout(timerId);
      void flushActionQueue();
      void syncWithServer();
    };

    timerId = setTimeout(syncWithServer, mqttConnected ? 2500 : 1000);
    window.addEventListener('online', handleWakeUp);
    document.addEventListener('visibilitychange', handleWakeUp);

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
      window.removeEventListener('online', handleWakeUp);
      document.removeEventListener('visibilitychange', handleWakeUp);
    };
  }, [
    room?.code,
    memberId,
    mqttConnected,
    makeCompactRoom,
    commitRoomState,
    flushActionQueue,
  ]);

  // Sync geminiApiKey when account syncs from server
  useEffect(() => {
    if (account?.geminiApiKey && account.geminiApiKey !== geminiApiKey) {
      setGeminiApiKeyState(account.geminiApiKey);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(STORAGE_GEMINI_KEY, account.geminiApiKey);
        } catch {
          // Ignore
        }
      }
    }
  }, [account?.geminiApiKey, geminiApiKey]);

  const setGeminiApiKey = useCallback((key: string) => {
    const trimmed = key.trim();
    setGeminiApiKeyState(trimmed);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_GEMINI_KEY, trimmed);
        window.dispatchEvent(
          new CustomEvent('exam-room-gemini-key-updated', { detail: trimmed })
        );
      } catch {
        // Ignore
      }
    }

    const currentAcc = accountRef.current;
    if (currentAcc) {
      const updatedAcc = {
        ...currentAcc,
        geminiApiKey: trimmed,
        updatedAt: Date.now(),
      };
      setAccount(updatedAcc);
      void fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateProfile',
          email: currentAcc.email,
          account: currentAcc,
          geminiApiKey: trimmed,
        }),
      }).catch(() => {});
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearKickedNotice = useCallback(() => setWasKicked(false), []);

  const saveGoogleClientId = useCallback(async (clientId: string) => {
    const trimmed = clientId.trim();
    setError(null);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setGoogleClientId',
          clientId: trimmed,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Could not save Google Client ID.');
      }
      setGoogleClientId(data.googleClientId || trimmed);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          STORAGE_GOOGLE_CLIENT_ID_KEY,
          data.googleClientId || trimmed
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save Google Client ID'
      );
    }
  }, []);

  const loginWithGoogle = useCallback(
    async (params: {
      email?: string;
      name?: string;
      username?: string;
      avatar?: string;
      pictureUrl?: string;
      googleCredential?: string;
      googleAccessToken?: string;
    }): Promise<UserAccount | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'login',
            ...params,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.account) {
          throw new Error(data?.error || 'Google Sign-In failed.');
        }
        setAccount(data.account);
        return data.account as UserAccount;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Google Sign-In failed');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const logoutAccount = useCallback(() => {
    setAccount(null);
  }, []);

  const updateUsername = useCallback(
    async (newUsername: string): Promise<boolean> => {
      const currentAcc = accountRef.current;
      if (!currentAcc) return false;
      setError(null);
      try {
        const res = await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'updateUsername',
            email: currentAcc.email,
            account: currentAcc,
            newUsername,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.account) {
          throw new Error(data?.error || 'Could not update username.');
        }
        setAccount(data.account);
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to update username'
        );
        return false;
      }
    },
    []
  );

  const searchUsersByUsername = useCallback(
    async (query: string): Promise<PublicDirectoryUser[]> => {
      const clean = query.trim().toLowerCase().replace(/^@+/, '');
      const localMatches = Array.from(directoryMapRef.current.values()).filter(
        (u) =>
          u.username !== accountRef.current?.username &&
          (!clean ||
            u.username.includes(clean) ||
            u.name.toLowerCase().includes(clean))
      );

      try {
        const res = await fetch(
          `/api/accounts?q=${encodeURIComponent(clean)}`,
          { cache: 'no-store' }
        );
        if (res.ok) {
          const data = await res.json();
          const serverUsers: PublicDirectoryUser[] = Array.isArray(data?.users)
            ? data.users
            : [];
          const mergedMap = new Map<string, PublicDirectoryUser>();
          for (const u of [...localMatches, ...serverUsers]) {
            if (u.username && u.username !== accountRef.current?.username) {
              mergedMap.set(u.username, u);
            }
          }
          return Array.from(mergedMap.values()).slice(0, 12);
        }
      } catch {
        // Fallback to local MQTT directory
      }
      return localMatches.slice(0, 12);
    },
    []
  );

  const addFriendByUsername = useCallback(
    async (friendUsername: string): Promise<boolean> => {
      const currentAcc = accountRef.current;
      if (!currentAcc) {
        setError('Sign in with Google first to add friends by @username.');
        return false;
      }
      setError(null);
      const clean = friendUsername.trim().replace(/^@+/, '').toLowerCase();
      const directoryMatch = directoryMapRef.current.get(clean);

      try {
        const res = await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'addFriend',
            email: currentAcc.email,
            username: currentAcc.username,
            account: currentAcc,
            friendUsername: clean,
            directoryMatch,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.account) {
          throw new Error(data?.error || 'Failed to add friend.');
        }
        setAccount(data.account);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add friend');
        return false;
      }
    },
    []
  );

  const removeFriendByUsername = useCallback(
    async (friendUsername: string) => {
      const currentAcc = accountRef.current;
      if (!currentAcc) return;
      try {
        const res = await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'removeFriend',
            email: currentAcc.email,
            friendUsername,
          }),
        });
        const data = await res.json();
        if (res.ok && data?.account) {
          setAccount(data.account);
        }
      } catch {
        // Ignore
      }
    },
    []
  );

  const inviteFriendToRoom = useCallback(
    async (friendUsername: string): Promise<boolean> => {
      const currentAcc = accountRef.current;
      const currentRoom = roomRef.current;
      if (!currentAcc || !currentRoom) {
        setError('Sign in and enter a room before inviting friends.');
        return false;
      }
      const cleanTo = friendUsername.trim().replace(/^@+/, '').toLowerCase();
      if (!cleanTo) return false;

      const now = Date.now();
      const inviteId = `inv-${now}-${Math.random().toString(36).slice(2, 7)}`;
      const invite: RoomInvite = {
        id: inviteId,
        fromUsername: currentAcc.username,
        fromEmail: currentAcc.email,
        fromName: currentAcc.name,
        fromAvatar: currentAcc.avatar,
        roomCode: currentRoom.code,
        roomTitle: currentRoom.title,
        createdAt: now,
      };

      // 1. Publish over MQTT immediately (0ms) or queue if reconnecting
      const client =
        userMqttClientRef.current?.connected
          ? userMqttClientRef.current
          : mqttClientRef.current?.connected
          ? mqttClientRef.current
          : null;

      let mqttSentOrQueued = false;
      if (client && publishInviteOverMqtt(client, cleanTo, invite)) {
        mqttSentOrQueued = true;
      } else {
        pendingOutboundInvitesRef.current.push({
          toUsername: cleanTo,
          invite,
        });
        mqttSentOrQueued = true;
      }

      // 2. Persist via /api/accounts in background with 1 retry so button never hangs
      const sendHttp = async () => {
        const res = await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'sendInvite',
            inviteId,
            fromUsername: currentAcc.username,
            fromEmail: currentAcc.email,
            fromName: currentAcc.name,
            fromAvatar: currentAcc.avatar,
            toUsername: cleanTo,
            roomCode: currentRoom.code,
            roomTitle: currentRoom.title,
          }),
        });
        if (!res.ok) return null;
        return res.json();
      };

      void (async () => {
        try {
          let data = await sendHttp();
          if (!data) {
            await new Promise((r) => setTimeout(r, 700));
            data = await sendHttp();
          }
          if (data?.inboxInvites) {
            const activeClient =
              userMqttClientRef.current?.connected
                ? userMqttClientRef.current
                : mqttClientRef.current?.connected
                ? mqttClientRef.current
                : null;
            if (activeClient) {
              publishInviteOverMqtt(
                activeClient,
                cleanTo,
                invite,
                data.inboxInvites as RoomInvite[]
              );
            }
          }
        } catch {
          // MQTT delivery already succeeded or queued
        }
      })();

      return mqttSentOrQueued;
    },
    [publishInviteOverMqtt]
  );

  const dismissRoomInvite = useCallback(async (inviteId: string) => {
    const currentAcc = accountRef.current;
    if (!currentAcc) return;
    const nextInvites = currentAcc.invites.filter((i) => i.id !== inviteId);
    setAccount((prev) => (prev ? { ...prev, invites: nextInvites } : prev));

    // Update retained MQTT inbox so dismissed invite doesn't return
    const client = userMqttClientRef.current || mqttClientRef.current;
    if (client && client.connected && currentAcc.username) {
      const inboxTopic = `examroom/v2/user/${encodeURIComponent(
        currentAcc.username.toLowerCase()
      )}/inbox`;
      client.publish(inboxTopic, JSON.stringify(nextInvites), {
        qos: 1,
        retain: true,
      });
    }

    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'dismissInvite',
          email: currentAcc.email,
          account: currentAcc,
          inviteId,
        }),
      });
      const data = await res.json();
      if (res.ok && data?.account) {
        setAccount(data.account);
      }
    } catch {
      // Ignore
    }
  }, []);

  const refreshRoomAndAccount = useCallback(async () => {
    const activeMemberId = memberId || getOrCreateLocalMemberId();
    const tasks: Promise<void>[] = [];

    if (roomRef.current?.code) {
      const code = roomRef.current.code;
      tasks.push(flushActionQueue());
      tasks.push(
        fetch(`/api/rooms/${encodeURIComponent(code)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            action: 'sync',
            memberId: activeMemberId,
            includeQuestions: true,
            fallbackRoom: makeCompactRoom(roomRef.current),
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.room) {
              commitRoomState(data.room, { publishMqtt: true });
            }
          })
          .catch(() => {})
      );
    }

    if (accountRef.current?.email) {
      tasks.push(
        fetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            action: 'sync',
            email: accountRef.current.email,
            account: accountRef.current,
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.account) {
              setAccount(data.account);
            }
          })
          .catch(() => {})
      );
    }

    await Promise.all(tasks);
  }, [memberId, flushActionQueue, makeCompactRoom, commitRoomState]);

  const createRoom = useCallback(
    async (params: {
      name: string;
      avatar: string;
      title?: string;
      mode?: GameMode;
    }): Promise<RoomState | null> => {
      setIsLoading(true);
      setError(null);
      setWasKicked(false);
      try {
        const activeMemberId = memberId || getOrCreateLocalMemberId();
        if (!memberId) setMemberId(activeMemberId);

        const res = await fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create',
            memberId: activeMemberId,
            name: params.name,
            avatar: params.avatar,
            username: accountRef.current?.username,
            email: accountRef.current?.email,
            pictureUrl: accountRef.current?.pictureUrl,
            title: params.title,
            mode: params.mode || 'wait',
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.room) {
          throw new Error(data.error || 'Could not create room.');
        }
        roomRef.current = data.room;
        setRoom(data.room);
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(STORAGE_ACTIVE_ROOM_KEY, data.room.code);
          } catch {
            // Ignore
          }
        }
        return data.room as RoomState;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create room';
        setError(msg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [memberId]
  );

  const joinRoom = useCallback(
    async (params: {
      code: string;
      name: string;
      avatar: string;
    }): Promise<RoomState | null> => {
      setIsLoading(true);
      setError(null);
      setWasKicked(false);
      try {
        const activeMemberId = memberId || getOrCreateLocalMemberId();
        if (!memberId) setMemberId(activeMemberId);

        const cleanCode = params.code.trim().toUpperCase();
        const res = await fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'join',
            code: cleanCode,
            memberId: activeMemberId,
            name: params.name,
            avatar: params.avatar,
            username: accountRef.current?.username,
            email: accountRef.current?.email,
            pictureUrl: accountRef.current?.pictureUrl,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.room) {
          throw new Error(data.error || `Room "${cleanCode}" not found.`);
        }
        roomRef.current = data.room;
        setRoom(data.room);
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(STORAGE_ACTIVE_ROOM_KEY, data.room.code);
          } catch {
            // Ignore
          }
        }
        return data.room as RoomState;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to join room';
        setError(msg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [memberId]
  );

  const leaveRoom = useCallback(() => {
    const departingRoom = roomRef.current;
    const activeMemberId = memberId || getOrCreateLocalMemberId();

    if (departingRoom?.code && activeMemberId && departingRoom.members.length > 1) {
      const remainingMembers = departingRoom.members.filter(
        (m) => m.id !== activeMemberId
      );
      const qIdx = departingRoom.currentQuestionIndex;
      const allRemainingAnswered =
        remainingMembers.length > 0 &&
        remainingMembers.every((m) => m.answers[qIdx] !== undefined);

      const updatedRoom: RoomState = {
        ...departingRoom,
        kickedMemberIds: Array.from(
          new Set([...(departingRoom.kickedMemberIds || []), activeMemberId])
        ),
        members: remainingMembers,
        isRevealed:
          departingRoom.status === 'active'
            ? allRemainingAnswered
            : departingRoom.isRevealed,
        version: departingRoom.version + 1,
        updatedAt: Date.now(),
      };

      publishMqttDelta(departingRoom.code, {
        t: 'kick',
        id: `kick-${Date.now()}`,
        target: activeMemberId,
        ts: Date.now(),
      });
      publishMqttState(updatedRoom, false);
      try {
        channelRef.current?.postMessage(updatedRoom);
      } catch {
        // Ignore
      }

      void fetch(`/api/rooms/${encodeURIComponent(departingRoom.code)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          action: 'removeMember',
          memberId: activeMemberId,
          targetMemberId: activeMemberId,
          fallbackRoom: makeCompactRoom(departingRoom),
        }),
      }).catch(() => {});
    }

    if (departingRoom?.code) {
      actionQueueRef.current = [];
      saveQueue(departingRoom.code, []);
      setSyncPendingCount(0);
    }

    if (mqttClientRef.current) {
      try {
        mqttClientRef.current.end(true);
      } catch {
        // Ignore
      }
      mqttClientRef.current = null;
    }
    setMqttConnected(false);
    commitRoomState(null, { publishMqtt: false });
    setError(null);
  }, [memberId, publishMqttDelta, publishMqttState, makeCompactRoom, commitRoomState]);

  const toggleReady = useCallback(
    async (ready?: boolean) => {
      const currentRoom = roomRef.current;
      const activeMemberId = memberId || getOrCreateLocalMemberId();
      if (!currentRoom || currentRoom.status !== 'lobby') return;

      const now = Date.now();
      lastLocalMutationAtRef.current = now;
      const myMember = currentRoom.members.find((m) => m.id === activeMemberId);
      const nextReady =
        typeof ready === 'boolean' ? ready : !Boolean(myMember?.isReady);

      const delta: RoomDelta = {
        t: 'ready',
        id: `rdy-${now}-${Math.random().toString(36).slice(2, 6)}`,
        m: activeMemberId,
        r: nextReady,
        ts: now,
      };
      applyDeltaToRoom(delta);
      publishMqttDelta(currentRoom.code, delta);
      if (roomRef.current) {
        publishMqttState(roomRef.current, false);
      }
      enqueueRoomAction('toggleReady', { ready: nextReady });
    },
    [memberId, applyDeltaToRoom, publishMqttDelta, publishMqttState, enqueueRoomAction]
  );

  const updateSettings = useCallback(
    async (settings: RoomSettingsUpdate) => {
      const currentRoom = roomRef.current;
      if (!currentRoom) return;
      const now = Date.now();
      lastLocalMutationAtRef.current = now;
      const optimisticRoom: RoomState = {
        ...currentRoom,
        title:
          typeof settings.title === 'string' && settings.title.trim()
            ? settings.title.trim()
            : currentRoom.title,
        mode:
          settings.mode === 'wait' || settings.mode === 'race'
            ? settings.mode
            : currentRoom.mode,
        timePerQuestion:
          typeof settings.timePerQuestion === 'number'
            ? settings.timePerQuestion <= 0
              ? 0
              : Math.max(5, Math.min(180, settings.timePerQuestion))
            : currentRoom.timePerQuestion,
        version: (currentRoom.version || 1) + 2,
        updatedAt: Math.max(now + 1000, (currentRoom.updatedAt || now) + 1),
      };
      commitRoomState(optimisticRoom, { publishMqtt: true });
      enqueueRoomAction('updateSettings', { settings });
    },
    [commitRoomState, enqueueRoomAction]
  );

  const setQuestions = useCallback(
    async (questions: Question[], title?: string) => {
      const currentRoom = roomRef.current;
      if (!currentRoom) return;
      const now = Date.now();
      lastLocalMutationAtRef.current = now;
      const digest = computeQuestionsDigest(questions);
      questionsCacheRef.current.set(digest, questions);

      const optimisticRoom: RoomState = {
        ...currentRoom,
        questions,
        questionsDigest: digest,
        questionsUpdatedAt: now,
        title: title?.trim() || currentRoom.title,
        currentQuestionIndex: 0,
        forceRevealedQuestionIndex: -1,
        isRevealed: false,
        version: currentRoom.version + 2,
        updatedAt: now,
      };
      commitRoomState(optimisticRoom, {
        publishMqtt: true,
        includeQuestions: true,
      });
      enqueueRoomAction('setQuestions', { questions, title });
    },
    [commitRoomState, enqueueRoomAction]
  );

  const parseAndSetMarkdown = useCallback(
    async (params: {
      markdown: string;
      title?: string;
      useGemini?: boolean;
      apiKey?: string;
      attachments?: QuestionAttachment[];
    }): Promise<ParseQuestionsResult | null> => {
      setIsLoading(true);
      setError(null);
      try {
        // Pure local Markdown can be parsed immediately on client without blocking if Gemini isn't used
        if (
          !params.useGemini &&
          (!params.attachments || params.attachments.length === 0) &&
          params.markdown.trim()
        ) {
          const localResult = parseMarkdownQuestions(params.markdown);
          if (localResult.questions.length > 0) {
            if (roomRef.current?.code) {
              await setQuestions(localResult.questions, params.title);
            }
            return localResult;
          }
        }

        const res = await fetch('/api/parse-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            markdown: params.markdown,
            useGemini: params.useGemini,
            apiKey: params.apiKey,
            attachments: params.attachments,
          }),
        });
        const data = (await res.json()) as ParseQuestionsResult & {
          error?: string;
        };
        if (!res.ok || !data.questions || data.questions.length === 0) {
          if (
            params.markdown &&
            (!params.attachments || params.attachments.length === 0)
          ) {
            const fallback = parseMarkdownQuestions(params.markdown);
            if (fallback.questions.length > 0) {
              if (roomRef.current?.code) {
                await setQuestions(fallback.questions, params.title);
              }
              return fallback;
            }
          }
          throw new Error(
            data.error ||
              data.warnings?.[0] ||
              'Could not parse any questions from the provided input.'
          );
        }

        if (roomRef.current?.code) {
          await setQuestions(data.questions, params.title);
        }
        return data;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to parse questions';
        setError(msg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [setQuestions]
  );

  const startExam = useCallback(
    async (modeOverride?: GameMode) => {
      const currentRoom = roomRef.current;
      if (!currentRoom || currentRoom.questions.length === 0) return;
      const allReady =
        currentRoom.members.length > 0 &&
        currentRoom.members.every((m) => Boolean(m.isReady));
      if (!allReady) return;

      const now = Date.now();
      lastLocalMutationAtRef.current = now;
      const optimisticRoom: RoomState = {
        ...currentRoom,
        mode: modeOverride || currentRoom.mode,
        status: 'active',
        currentQuestionIndex: 0,
        questionStartedAt: now,
        examSessionId: now,
        forceRevealedQuestionIndex: -1,
        isRevealed: false,
        reactions: [],
        members: currentRoom.members.map((m) => ({
          ...m,
          isReady: false,
          readyForNextQuestionIndex: -1,
          score: 0,
          streak: 0,
          bestStreak: 0,
          correctCount: 0,
          totalTimeMs: 0,
          answers: {},
        })),
        version: currentRoom.version + 2,
        updatedAt: now,
      };
      commitRoomState(optimisticRoom, { publishMqtt: true });
      enqueueRoomAction(
        'startExam',
        modeOverride ? { mode: modeOverride } : {}
      );
    },
    [commitRoomState, enqueueRoomAction]
  );

  const submitAnswer = useCallback(
    async (optionIndex: number) => {
      const currentRoom = roomRef.current;
      const activeMemberId = memberId || getOrCreateLocalMemberId();
      if (!currentRoom || currentRoom.status !== 'active') return;

      const targetQIdx = currentRoom.currentQuestionIndex;
      const myMember = currentRoom.members.find((m) => m.id === activeMemberId);
      if (myMember && myMember.answers[targetQIdx] !== undefined) {
        return;
      }

      const now = Date.now();
      lastLocalMutationAtRef.current = now;
      const delta: RoomDelta = {
        t: 'ans',
        id: `ans-${now}-${Math.random().toString(36).slice(2, 6)}`,
        m: activeMemberId,
        q: targetQIdx,
        o: optionIndex,
        ts: now,
      };
      applyDeltaToRoom(delta);
      publishMqttDelta(currentRoom.code, delta);
      if (roomRef.current) {
        publishMqttState(roomRef.current, false);
      }
      enqueueRoomAction('submitAnswer', {
        optionIndex,
        questionIndex: targetQIdx,
      });
    },
    [memberId, applyDeltaToRoom, publishMqttDelta, publishMqttState, enqueueRoomAction]
  );

  const revealQuestion = useCallback(async () => {
    // Collective reveal only in both Wait and Race modes (no force reveal)
  }, []);

  const nextQuestion = useCallback(async () => {
    const currentRoom = roomRef.current;
    const activeMemberId = memberId || getOrCreateLocalMemberId();
    if (!currentRoom || currentRoom.status !== 'active') return;

    const targetQIdx = currentRoom.currentQuestionIndex;
    const myMember = currentRoom.members.find((m) => m.id === activeMemberId);
    if (
      myMember &&
      (myMember.readyForNextQuestionIndex ?? -1) >= targetQIdx
    ) {
      return;
    }

    const now = Date.now();
    lastLocalMutationAtRef.current = now;
    const delta: RoomDelta = {
      t: 'next',
      id: `nxt-${now}-${Math.random().toString(36).slice(2, 6)}`,
      m: activeMemberId,
      q: targetQIdx,
      ts: now,
    };
    applyDeltaToRoom(delta);
    publishMqttDelta(currentRoom.code, delta);
    if (roomRef.current) {
      publishMqttState(roomRef.current, false);
    }
    enqueueRoomAction('nextQuestion', { questionIndex: targetQIdx });
  }, [memberId, applyDeltaToRoom, publishMqttDelta, publishMqttState, enqueueRoomAction]);

  const resetRoom = useCallback(
    async (backToLobby = true) => {
      const currentRoom = roomRef.current;
      if (!currentRoom) return;
      const now = Date.now();
      lastLocalMutationAtRef.current = now;
      const optimisticRoom: RoomState = {
        ...currentRoom,
        status: backToLobby ? 'lobby' : 'active',
        currentQuestionIndex: 0,
        questionStartedAt: now,
        examSessionId: now,
        forceRevealedQuestionIndex: -1,
        isRevealed: false,
        reactions: [],
        members: currentRoom.members.map((m) => ({
          ...m,
          isReady: false,
          readyForNextQuestionIndex: -1,
          score: 0,
          streak: 0,
          bestStreak: 0,
          correctCount: 0,
          totalTimeMs: 0,
          answers: {},
        })),
        version: currentRoom.version + 2,
        updatedAt: now,
      };
      commitRoomState(optimisticRoom, { publishMqtt: true });
      enqueueRoomAction('resetRoom', { backToLobby });
    },
    [commitRoomState, enqueueRoomAction]
  );

  const sendReaction = useCallback(
    async (input: SendReactionInput | string) => {
      const currentRoom = roomRef.current;
      const activeMemberId = memberId || getOrCreateLocalMemberId();
      if (!currentRoom) return;

      const normalized: SendReactionInput =
        typeof input === 'string'
          ? { emoji: input, kind: 'general' }
          : input;

      const sender =
        currentRoom.members.find((m) => m.id === activeMemberId) ||
        currentRoom.members[0];
      if (!sender) return;

      const target = normalized.targetMemberId
        ? currentRoom.members.find((m) => m.id === normalized.targetMemberId)
        : undefined;

      const now = Date.now();
      lastLocalMutationAtRef.current = now;
      const rx: EmojiReaction = {
        id: `rx-${now}-${Math.random().toString(36).slice(2, 7)}`,
        senderId: sender.id,
        senderName: sender.name,
        senderAvatar: sender.avatar,
        emoji: normalized.emoji,
        label: normalized.label,
        kind: normalized.kind || 'general',
        targetMemberId: target?.id,
        targetMemberName: target?.name,
        targetMemberAvatar: target?.avatar,
        questionIndex:
          normalized.questionIndex !== undefined
            ? normalized.questionIndex
            : currentRoom.currentQuestionIndex,
        createdAt: now,
      };

      const delta: RoomDelta = {
        t: 'rx',
        id: rx.id,
        m: sender.id,
        rx,
        ts: now,
      };
      applyDeltaToRoom(delta);
      setNowTick(now);
      publishMqttDelta(currentRoom.code, delta);
      enqueueRoomAction('sendReaction', { reaction: normalized });
    },
    [memberId, applyDeltaToRoom, publishMqttDelta, enqueueRoomAction]
  );

  const setStatusBadge = useCallback(
    async (badge: string | null) => {
      const currentRoom = roomRef.current;
      const activeMemberId = memberId || getOrCreateLocalMemberId();
      if (!currentRoom) return;

      const now = Date.now();
      lastLocalMutationAtRef.current = now;
      const delta: RoomDelta = {
        t: 'badge',
        id: `bdg-${now}-${Math.random().toString(36).slice(2, 6)}`,
        m: activeMemberId,
        b: badge,
        ts: now,
      };
      applyDeltaToRoom(delta);
      publishMqttDelta(currentRoom.code, delta);
      enqueueRoomAction('setStatusBadge', { badge });
    },
    [memberId, applyDeltaToRoom, publishMqttDelta, enqueueRoomAction]
  );

  const removeMember = useCallback(
    async (targetMemberId: string) => {
      const currentRoom = roomRef.current;
      if (!currentRoom || !targetMemberId) return;
      const now = Date.now();
      lastLocalMutationAtRef.current = now;

      const delta: RoomDelta = {
        t: 'kick',
        id: `kck-${now}-${Math.random().toString(36).slice(2, 6)}`,
        target: targetMemberId,
        ts: now,
      };
      applyDeltaToRoom(delta);
      publishMqttDelta(currentRoom.code, delta);
      if (roomRef.current) {
        publishMqttState(roomRef.current, false);
      }
      enqueueRoomAction('removeMember', { targetMemberId });
    },
    [applyDeltaToRoom, publishMqttDelta, publishMqttState, enqueueRoomAction]
  );

  const updateMemberProfile = useCallback(
    async (params: {
      name?: string;
      avatar?: string;
      username?: string;
      geminiApiKey?: string;
    }) => {
      setError(null);
      const nextName = params.name?.trim();
      const nextAvatar = params.avatar?.trim();
      const nextUsername = params.username
        ?.trim()
        .replace(/^@+/, '')
        .toLowerCase();

      if (typeof params.geminiApiKey === 'string') {
        setGeminiApiKey(params.geminiApiKey);
      }

      if (typeof window !== 'undefined' && (nextName || nextAvatar)) {
        try {
          const prevRaw = window.localStorage.getItem(STORAGE_PROFILE_KEY);
          const prev = prevRaw ? JSON.parse(prevRaw) : {};
          window.localStorage.setItem(
            STORAGE_PROFILE_KEY,
            JSON.stringify({
              name: nextName || prev.name || '',
              avatar: nextAvatar || prev.avatar || '🐥',
              custom: true,
            })
          );
          window.dispatchEvent(
            new CustomEvent('exam-room-profile-updated', {
              detail: { name: nextName, avatar: nextAvatar },
            })
          );
        } catch {
          // Ignore
        }
      }

      // Immediately update active room member in 0ms (works for both Guests and Signed-in users)
      const currentRoom = roomRef.current;
      const activeMemberId = memberId || getOrCreateLocalMemberId();
      if (currentRoom?.code && (nextName || nextAvatar || nextUsername)) {
        const now = Date.now();
        lastLocalMutationAtRef.current = now;
        const delta: RoomDelta = {
          t: 'prof',
          id: `prf-${now}-${Math.random().toString(36).slice(2, 6)}`,
          m: activeMemberId,
          name: nextName,
          avatar: nextAvatar,
          username: nextUsername,
          ts: now,
        };
        applyDeltaToRoom(delta);
        publishMqttDelta(currentRoom.code, delta);
        if (roomRef.current) {
          publishMqttState(roomRef.current, false);
        }
        enqueueRoomAction('updateProfile', {
          name: nextName,
          avatar: nextAvatar,
          username: nextUsername,
        });
      }

      // Persist to Google account on server if signed in
      const currentAcc = accountRef.current;
      if (currentAcc) {
        try {
          const res = await fetch('/api/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'updateProfile',
              email: currentAcc.email,
              account: currentAcc,
              name: nextName,
              avatar: nextAvatar,
              newUsername: params.username,
              geminiApiKey: params.geminiApiKey,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data?.error || 'Could not update profile.');
          }
          if (data?.account) {
            setAccount(data.account);
          }
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Failed to update profile'
          );
        }
      }
    },
    [
      memberId,
      setGeminiApiKey,
      applyDeltaToRoom,
      publishMqttDelta,
      publishMqttState,
      enqueueRoomAction,
    ]
  );

  // Derived states
  const me = useMemo<Member | null>(() => {
    if (!room) return null;
    return (
      room.members.find((m) => m.id === memberId) || room.members[0] || null
    );
  }, [room, memberId]);

  const isHost = useMemo<boolean>(() => {
    if (!room || !me) return false;
    return room.hostId === me.id || me.isHost;
  }, [room, me]);

  const memberConnectionStatus = useMemo<Record<string, ConnectionStatus>>(() => {
    const map: Record<string, ConnectionStatus> = {};
    if (!room) return map;
    const now = presenceTick;

    for (const m of room.members) {
      if (me && m.id === me.id) {
        map[m.id] = isLocalOffline ? 'offline' : 'online';
        continue;
      }
      const explicit = peerExplicitStatusRef.current[m.id];
      const lastSeen = peerLastSeenRef.current[m.id];
      if (!lastSeen) {
        map[m.id] = 'online';
        continue;
      }
      const age = now - lastSeen;
      if (explicit === 'offline') {
        map[m.id] = 'offline';
      } else if (age > 25000) {
        map[m.id] = 'offline';
      } else if (age > 10000) {
        map[m.id] = 'weak';
      } else {
        map[m.id] = 'online';
      }
    }
    return map;
  }, [room, me, isLocalOffline, presenceTick]);

  const allMembersReady = useMemo<boolean>(() => {
    if (!room || room.members.length === 0) return false;
    return room.members.every((m) => Boolean(m.isReady));
  }, [room]);

  const readyCount = useMemo<number>(() => {
    if (!room) return 0;
    return room.members.filter((m) => Boolean(m.isReady)).length;
  }, [room]);

  const myReadyForNext = useMemo<boolean>(() => {
    if (!room || !me || room.status !== 'active') return false;
    return (me.readyForNextQuestionIndex ?? -1) >= room.currentQuestionIndex;
  }, [room, me]);

  const nextReadyCount = useMemo<number>(() => {
    if (!room || room.status !== 'active') return 0;
    const qIdx = room.currentQuestionIndex;
    return room.members.filter(
      (m) => (m.readyForNextQuestionIndex ?? -1) >= qIdx
    ).length;
  }, [room]);

  const waitingOnNextMembers = useMemo<Member[]>(() => {
    if (!room || room.status !== 'active') return [];
    const qIdx = room.currentQuestionIndex;
    return room.members.filter(
      (m) => (m.readyForNextQuestionIndex ?? -1) < qIdx
    );
  }, [room]);

  const currentQuestion = useMemo<Question | null>(() => {
    if (!room || room.status === 'lobby') return null;
    return room.questions[room.currentQuestionIndex] || null;
  }, [room]);

  const myCurrentAnswer = useMemo<MemberAnswer | null>(() => {
    if (!room || !me) return null;
    return me.answers[room.currentQuestionIndex] || null;
  }, [room, me]);

  // Collective anti-spoiler reveal for BOTH 'wait' AND 'race' modes:
  // Neither mode reveals answers or peer tags until every member has answered!
  const isAnswerRevealedToMe = useMemo<boolean>(() => {
    if (!room) return false;
    if (room.status === 'finished') return true;
    const qIdx = room.currentQuestionIndex;
    const allMembersAnswered =
      room.members.length > 0 &&
      room.members.every((m) => m.answers[qIdx] !== undefined);

    return allMembersAnswered;
  }, [room]);

  const optionTags = useMemo<Record<number, MemberAnswerTag[]>>(() => {
    const map: Record<number, MemberAnswerTag[]> = { 0: [], 1: [], 2: [], 3: [] };
    if (!room || !currentQuestion) return map;

    currentQuestion.options.forEach((_, idx) => {
      map[idx] = [];
    });

    const qIdx = room.currentQuestionIndex;

    const answeredMembers = room.members
      .filter((m) => m.answers[qIdx] !== undefined)
      .sort(
        (a, b) =>
          (a.answers[qIdx]?.answeredAt || 0) -
          (b.answers[qIdx]?.answeredAt || 0)
      );

    answeredMembers.forEach((m, orderIdx) => {
      const ans = m.answers[qIdx];
      if (!ans) return;
      const isMe = me ? m.id === me.id : false;

      // Never show another member's tag on an option before everyone answers!
      const canSeeTag = isAnswerRevealedToMe || isMe;
      if (!canSeeTag) return;

      if (!map[ans.optionIndex]) {
        map[ans.optionIndex] = [];
      }
      map[ans.optionIndex].push({
        memberId: m.id,
        name: m.name,
        avatar: m.avatar,
        isMe,
        optionIndex: ans.optionIndex,
        isCorrect: ans.isCorrect,
        timeMs: ans.timeMs,
        pointsEarned: ans.pointsEarned,
        order: orderIdx + 1,
      });
    });

    return map;
  }, [room, currentQuestion, me, isAnswerRevealedToMe]);

  const answeredCount = useMemo<number>(() => {
    if (!room) return 0;
    const qIdx = room.currentQuestionIndex;
    return room.members.filter((m) => m.answers[qIdx] !== undefined).length;
  }, [room]);

  const totalMembersCount = room?.members.length || 0;

  const waitingOnMembers = useMemo<Member[]>(() => {
    if (!room) return [];
    const qIdx = room.currentQuestionIndex;
    return room.members.filter((m) => m.answers[qIdx] === undefined);
  }, [room]);

  const peersWhoGotItRightWhenIMissed = useMemo<Member[]>(() => {
    if (!room || !me || !isAnswerRevealedToMe || !myCurrentAnswer) return [];
    if (myCurrentAnswer.isCorrect) return [];
    const qIdx = room.currentQuestionIndex;
    return room.members.filter(
      (m) => m.id !== me.id && m.answers[qIdx]?.isCorrect === true
    );
  }, [room, me, isAnswerRevealedToMe, myCurrentAnswer]);

  const peersWhoGotItRightWithMe = useMemo<Member[]>(() => {
    if (!room || !me || !isAnswerRevealedToMe || !myCurrentAnswer) return [];
    if (!myCurrentAnswer.isCorrect) return [];
    const qIdx = room.currentQuestionIndex;
    return room.members.filter(
      (m) => m.id !== me.id && m.answers[qIdx]?.isCorrect === true
    );
  }, [room, me, isAnswerRevealedToMe, myCurrentAnswer]);

  const leaderboard = useMemo<Member[]>(() => {
    if (!room) return [];
    return [...room.members].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.correctCount !== a.correctCount)
        return b.correctCount - a.correctCount;
      return a.totalTimeMs - b.totalTimeMs;
    });
  }, [room]);

  const activeReactions = useMemo<EmojiReaction[]>(() => {
    if (!room) return [];
    return room.reactions.filter(
      (rx) => nowTick - rx.createdAt < REACTION_TTL_MS
    );
  }, [room, nowTick]);

  return {
    room,
    me,
    isHost,
    isLoading,
    error,
    clearError,
    isLocalOffline,
    mqttConnected,
    syncPendingCount,
    wasKicked,
    clearKickedNotice,
    memberConnectionStatus,
    friendPresence,
    notificationPermission,
    requestNotificationPermission,
    allMembersReady,
    readyCount,
    myReadyForNext,
    nextReadyCount,
    waitingOnNextMembers,
    currentQuestion,
    myCurrentAnswer,
    isAnswerRevealedToMe,
    optionTags,
    answeredCount,
    totalMembersCount,
    waitingOnMembers,
    peersWhoGotItRightWhenIMissed,
    peersWhoGotItRightWithMe,
    leaderboard,
    activeReactions,
    account,
    googleClientId,
    geminiApiKey,
    setGeminiApiKey,
    updateMemberProfile,
    saveGoogleClientId,
    loginWithGoogle,
    logoutAccount,
    updateUsername,
    searchUsersByUsername,
    addFriendByUsername,
    removeFriendByUsername,
    inviteFriendToRoom,
    dismissRoomInvite,
    refreshRoomAndAccount,
    createRoom,
    joinRoom,
    leaveRoom,
    toggleReady,
    updateSettings,
    setQuestions,
    parseAndSetMarkdown,
    startExam,
    submitAnswer,
    revealQuestion,
    nextQuestion,
    resetRoom,
    sendReaction,
    setStatusBadge,
    removeMember,
  };
}
