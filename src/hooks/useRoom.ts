'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mqtt, { MqttClient } from 'mqtt';
import {
  EmojiReaction,
  GameMode,
  Member,
  MemberAnswer,
  MemberAnswerTag,
  ParseQuestionsResult,
  Question,
  QuestionAttachment,
  RoomInvite,
  RoomSettingsUpdate,
  RoomState,
  SendReactionInput,
  UseRoomReturn,
  UserAccount,
} from '@/types/exam';
import { parseMarkdownQuestions } from '@/lib/markdown-parser';
import { mergeRoomStates } from '@/lib/room-store';

const STORAGE_MEMBER_ID_KEY = 'exam_room_member_id_v2';
const STORAGE_ACTIVE_ROOM_KEY = 'exam_room_active_code_v2';
const STORAGE_ACCOUNT_KEY = 'exam_room_account_v3';
const BROADCAST_CHANNEL_NAME = 'exam_room_live_channel_v2';
const REACTION_TTL_MS = 6500;

const MQTT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];

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

export function useRoom(): UseRoomReturn {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [memberId, setMemberId] = useState<string>('');
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const channelRef = useRef<BroadcastChannel | null>(null);
  const mqttClientRef = useRef<MqttClient | null>(null);
  const userMqttClientRef = useRef<MqttClient | null>(null);
  const roomRef = useRef<RoomState | null>(null);
  const accountRef = useRef<UserAccount | null>(null);

  useEffect(() => {
    const id = getOrCreateLocalMemberId();
    setMemberId(id);

    try {
      const savedAcc = window.localStorage.getItem(STORAGE_ACCOUNT_KEY);
      if (savedAcc) {
        const parsed = JSON.parse(savedAcc) as UserAccount;
        if (parsed?.email) {
          setAccount(parsed);
          accountRef.current = parsed;
        }
      }
    } catch {
      // Ignore storage read errors
    }
  }, []);

  useEffect(() => {
    roomRef.current = room;
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

  // Only tick every second when there are actually active reactions on screen (avoids idle re-renders)
  useEffect(() => {
    const timer = setInterval(() => {
      const reactions = roomRef.current?.reactions;
      if (reactions && reactions.length > 0) {
        const now = Date.now();
        const hasRecent = reactions.some((rx) => now - rx.createdAt < REACTION_TTL_MS + 1200);
        if (hasRecent) {
          setNowTick(now);
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const publishMqttState = useCallback((stateToPublish: RoomState) => {
    const client = mqttClientRef.current;
    if (!client || !client.connected || !stateToPublish?.code) return;
    try {
      const stateTopic = `examroom/v2/${stateToPublish.code}/state`;
      client.publish(stateTopic, JSON.stringify(stateToPublish), {
        qos: 1,
        retain: true,
      });
    } catch {
      // Ignore MQTT publish errors
    }
  }, []);

  const applyAndBroadcastRoom = useCallback(
    (nextRoom: RoomState | null, shouldPublishMqtt = true) => {
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

      setRoom((prev) => {
        const merged =
          prev && prev.code === nextRoom.code
            ? mergeRoomStates(prev, nextRoom)
            : nextRoom;
        roomRef.current = merged;

        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(STORAGE_ACTIVE_ROOM_KEY, merged.code);
            channelRef.current?.postMessage(merged);
          } catch {
            // Ignore
          }
        }
        if (shouldPublishMqtt) {
          publishMqttState(merged);
        }
        return merged;
      });
    },
    [publishMqttState]
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
      if (
        incoming &&
        incoming.code &&
        incoming.code === roomRef.current?.code
      ) {
        setRoom((prev) => {
          if (!prev) return incoming;
          const merged = mergeRoomStates(prev, incoming);
          roomRef.current = merged;
          return merged;
        });
      }
    };

    return () => {
      bc.close();
      channelRef.current = null;
    };
  }, []);

  // User-level MQTT listener + periodic account sync for live Room Invites & Friends
  useEffect(() => {
    const email = account?.email;
    if (!email || typeof window === 'undefined') return;

    let cancelled = false;
    const inviteTopic = `examroom/v2/user/${encodeURIComponent(email.toLowerCase())}/invites`;

    const client = mqtt.connect(MQTT_BROKERS[0], {
      clientId: `user-${Math.random().toString(36).slice(2, 10)}`,
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 3000,
    });
    userMqttClientRef.current = client;

    client.on('connect', () => {
      if (cancelled) return;
      client.subscribe(inviteTopic, { qos: 1 });
    });

    client.on('message', (topic, payload) => {
      if (cancelled || topic !== inviteTopic) return;
      try {
        const invite = JSON.parse(payload.toString()) as RoomInvite;
        if (invite?.id && invite?.roomCode) {
          setAccount((prev) => {
            if (!prev) return prev;
            if (prev.invites.some((i) => i.id === invite.id)) return prev;
            return {
              ...prev,
              invites: [invite, ...prev.invites.filter((i) => i.roomCode !== invite.roomCode)],
              updatedAt: Date.now(),
            };
          });
        }
      } catch {
        // Ignore
      }
    });

    const syncAccount = async () => {
      try {
        const res = await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'sync',
            email,
            account: accountRef.current,
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.account) {
          setAccount(data.account);
        }
      } catch {
        // Ignore
      }
    };

    syncAccount();
    const interval = setInterval(syncAccount, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      try {
        client.end(true);
      } catch {
        // Ignore
      }
      userMqttClientRef.current = null;
    };
  }, [account?.email]);

  // Real-time MQTT over WebSockets for instant multi-phone Room sync across Vercel instances
  useEffect(() => {
    const code = room?.code;
    if (!code || typeof window === 'undefined') return;

    let brokerIdx = 0;
    let isCancelled = false;
    const stateTopic = `examroom/v2/${code}/state`;
    const pingTopic = `examroom/v2/${code}/ping`;

    const connectBroker = (url: string) => {
      const client = mqtt.connect(url, {
        clientId: `exam-${code}-${Math.random().toString(36).slice(2, 9)}`,
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 2000,
      });

      mqttClientRef.current = client;

      client.on('connect', () => {
        if (isCancelled) return;
        client.subscribe([stateTopic, pingTopic], { qos: 1 }, () => {
          if (roomRef.current && roomRef.current.code === code) {
            if (roomRef.current.hostId !== '') {
              client.publish(stateTopic, JSON.stringify(roomRef.current), {
                qos: 1,
                retain: true,
              });
            }
            client.publish(
              pingTopic,
              JSON.stringify({
                sender: getOrCreateLocalMemberId(),
                ts: Date.now(),
              }),
              { qos: 0, retain: false }
            );
          }
        });
      });

      client.on('message', (topic, payload) => {
        if (isCancelled) return;
        try {
          if (topic === pingTopic) {
            const pingData = JSON.parse(payload.toString());
            if (
              pingData?.sender !== getOrCreateLocalMemberId() &&
              roomRef.current &&
              roomRef.current.code === code &&
              roomRef.current.hostId !== ''
            ) {
              client.publish(stateTopic, JSON.stringify(roomRef.current), {
                qos: 1,
                retain: true,
              });
            }
            return;
          }

          if (topic === stateTopic) {
            const incoming = JSON.parse(payload.toString()) as RoomState;
            if (!incoming || incoming.code !== code) return;

            setRoom((prev) => {
              if (!prev || prev.code !== code) {
                roomRef.current = incoming;
                return incoming;
              }
              const prevMemberCount = prev.members.length;
              const merged = mergeRoomStates(prev, incoming);
              roomRef.current = merged;

              if (
                merged.hostId !== '' &&
                (merged.members.length > incoming.members.length ||
                  merged.members.length > prevMemberCount)
              ) {
                try {
                  client.publish(stateTopic, JSON.stringify(merged), {
                    qos: 1,
                    retain: true,
                  });
                } catch {
                  // Ignore
                }
              }
              return merged;
            });
          }
        } catch {
          // Ignore malformed MQTT messages
        }
      });

      client.on('error', () => {
        if (isCancelled) return;
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

    return () => {
      isCancelled = true;
      if (mqttClientRef.current) {
        try {
          mqttClientRef.current.end(true);
        } catch {
          // Ignore
        }
        mqttClientRef.current = null;
      }
    };
  }, [room?.code]);

  // Bi-directional HTTP sync every 800ms with fallbackRoom CRDT merge
  useEffect(() => {
    if (!room?.code) return;
    let cancelled = false;
    const code = room.code;

    const syncWithServer = async () => {
      try {
        const currentRoom = roomRef.current;
        const activeMemberId = memberId || getOrCreateLocalMemberId();
        const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            action: 'sync',
            memberId: activeMemberId,
            fallbackRoom: currentRoom,
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.room) {
          setRoom((prev) => {
            if (!prev) return data.room;
            const merged = mergeRoomStates(prev, data.room);
            roomRef.current = merged;
            return merged;
          });
        }
      } catch {
        // Ignore transient network errors
      }
    };

    const interval = setInterval(syncWithServer, 800);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [room?.code, memberId]);

  const clearError = useCallback(() => setError(null), []);

  // Account & Friends actions
  const loginWithGoogle = useCallback(
    async (params: {
      email: string;
      name: string;
      avatar: string;
      pictureUrl?: string;
      googleCredential?: string;
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
          throw new Error(data?.error || 'Could not sign in.');
        }
        setAccount(data.account);
        return data.account as UserAccount;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sign-in failed');
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

  const addFriendByEmail = useCallback(
    async (friendEmail: string): Promise<boolean> => {
      const currentAcc = accountRef.current;
      if (!currentAcc) {
        setError('Sign in with your Google account to add friends.');
        return false;
      }
      setError(null);
      try {
        const res = await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'addFriend',
            email: currentAcc.email,
            name: currentAcc.name,
            avatar: currentAcc.avatar,
            account: currentAcc,
            friendEmail,
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

  const removeFriendByEmail = useCallback(async (friendEmail: string) => {
    const currentAcc = accountRef.current;
    if (!currentAcc) return;
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'removeFriend',
          email: currentAcc.email,
          friendEmail,
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

  const inviteFriendToRoom = useCallback(
    async (friendEmail: string): Promise<boolean> => {
      const currentAcc = accountRef.current;
      const currentRoom = roomRef.current;
      if (!currentAcc || !currentRoom) {
        setError('Sign in and enter a room before inviting friends.');
        return false;
      }
      try {
        const res = await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'sendInvite',
            fromEmail: currentAcc.email,
            fromName: currentAcc.name,
            fromAvatar: currentAcc.avatar,
            toEmail: friendEmail,
            roomCode: currentRoom.code,
            roomTitle: currentRoom.title,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.invite) {
          throw new Error(data?.error || 'Could not send invite.');
        }

        // Also broadcast live over MQTT user invite topic so friend gets instant popup
        const client = userMqttClientRef.current || mqttClientRef.current;
        if (client && client.connected) {
          const inviteTopic = `examroom/v2/user/${encodeURIComponent(
            friendEmail.trim().toLowerCase()
          )}/invites`;
          client.publish(inviteTopic, JSON.stringify(data.invite), {
            qos: 1,
            retain: false,
          });
        }
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send invite');
        return false;
      }
    },
    []
  );

  const dismissRoomInvite = useCallback(async (inviteId: string) => {
    const currentAcc = accountRef.current;
    if (!currentAcc) return;
    setAccount((prev) =>
      prev
        ? { ...prev, invites: prev.invites.filter((i) => i.id !== inviteId) }
        : prev
    );
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'dismissInvite',
          email: currentAcc.email,
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

  const createRoom = useCallback(
    async (params: {
      name: string;
      avatar: string;
      title?: string;
      mode?: GameMode;
    }): Promise<RoomState | null> => {
      setIsLoading(true);
      setError(null);
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
            ? departingRoom.mode === 'wait'
              ? allRemainingAnswered
              : departingRoom.forceRevealedQuestionIndex === qIdx || allRemainingAnswered
            : departingRoom.isRevealed,
        version: departingRoom.version + 1,
        updatedAt: Date.now(),
      };

      publishMqttState(updatedRoom);
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
          fallbackRoom: departingRoom,
        }),
      }).catch(() => {});
    }

    if (mqttClientRef.current) {
      try {
        mqttClientRef.current.end(true);
      } catch {
        // Ignore
      }
      mqttClientRef.current = null;
    }
    applyAndBroadcastRoom(null, false);
    setError(null);
  }, [memberId, publishMqttState, applyAndBroadcastRoom]);

  const postRoomAction = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      const currentRoom = roomRef.current;
      if (!currentRoom?.code) return;
      try {
        const activeMemberId = memberId || getOrCreateLocalMemberId();
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(currentRoom.code)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action,
              memberId: activeMemberId,
              fallbackRoom: currentRoom,
              ...payload,
            }),
          }
        );
        const data = await res.json();
        if (res.ok && data?.room) {
          applyAndBroadcastRoom(data.room, true);
        } else if (data?.error) {
          setError(data.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed');
      }
    },
    [memberId, applyAndBroadcastRoom]
  );

  const toggleReady = useCallback(
    async (ready?: boolean) => {
      await postRoomAction('toggleReady', typeof ready === 'boolean' ? { ready } : {});
    },
    [postRoomAction]
  );

  const updateSettings = useCallback(
    async (settings: RoomSettingsUpdate) => {
      await postRoomAction('updateSettings', { settings });
    },
    [postRoomAction]
  );

  const setQuestions = useCallback(
    async (questions: Question[], title?: string) => {
      await postRoomAction('setQuestions', { questions, title });
    },
    [postRoomAction]
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
          if (params.markdown && (!params.attachments || params.attachments.length === 0)) {
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
      await postRoomAction('startExam', modeOverride ? { mode: modeOverride } : {});
    },
    [postRoomAction]
  );

  const submitAnswer = useCallback(
    async (optionIndex: number) => {
      await postRoomAction('submitAnswer', { optionIndex });
    },
    [postRoomAction]
  );

  const revealQuestion = useCallback(async () => {
    await postRoomAction('revealQuestion');
  }, [postRoomAction]);

  const nextQuestion = useCallback(async () => {
    await postRoomAction('nextQuestion');
  }, [postRoomAction]);

  const resetRoom = useCallback(
    async (backToLobby = true) => {
      await postRoomAction('resetRoom', { backToLobby });
    },
    [postRoomAction]
  );

  const sendReaction = useCallback(
    async (input: SendReactionInput | string) => {
      const normalized: SendReactionInput =
        typeof input === 'string'
          ? { emoji: input, kind: 'general' }
          : input;
      await postRoomAction('sendReaction', { reaction: normalized });
    },
    [postRoomAction]
  );

  const setStatusBadge = useCallback(
    async (badge: string | null) => {
      await postRoomAction('setStatusBadge', { badge });
    },
    [postRoomAction]
  );

  const removeMember = useCallback(
    async (targetMemberId: string) => {
      await postRoomAction('removeMember', { targetMemberId });
    },
    [postRoomAction]
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
    return room.members.filter((m) => (m.readyForNextQuestionIndex ?? -1) >= qIdx).length;
  }, [room]);

  const waitingOnNextMembers = useMemo<Member[]>(() => {
    if (!room || room.status !== 'active') return [];
    const qIdx = room.currentQuestionIndex;
    return room.members.filter((m) => (m.readyForNextQuestionIndex ?? -1) < qIdx);
  }, [room]);

  const currentQuestion = useMemo<Question | null>(() => {
    if (!room || room.status === 'lobby') return null;
    return room.questions[room.currentQuestionIndex] || null;
  }, [room]);

  const myCurrentAnswer = useMemo<MemberAnswer | null>(() => {
    if (!room || !me) return null;
    return me.answers[room.currentQuestionIndex] || null;
  }, [room, me]);

  const isAnswerRevealedToMe = useMemo<boolean>(() => {
    if (!room) return false;
    if (room.status === 'finished') return true;
    const qIdx = room.currentQuestionIndex;
    const allMembersAnswered =
      room.members.length > 0 &&
      room.members.every((m) => m.answers[qIdx] !== undefined);

    if (room.mode === 'wait') {
      // Strictly never reveal early in Wait mode
      return allMembersAnswered;
    }

    const isForceRevealed = room.forceRevealedQuestionIndex === qIdx;
    return myCurrentAnswer !== null || isForceRevealed || allMembersAnswered;
  }, [room, myCurrentAnswer]);

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

      const canSeeTag =
        room.mode === 'race' || isAnswerRevealedToMe || isMe;

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
    loginWithGoogle,
    logoutAccount,
    addFriendByEmail,
    removeFriendByEmail,
    inviteFriendToRoom,
    dismissRoomInvite,
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
