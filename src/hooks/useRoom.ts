'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EmojiReaction,
  GameMode,
  Member,
  MemberAnswer,
  MemberAnswerTag,
  ParseQuestionsResult,
  Question,
  RoomSettingsUpdate,
  RoomState,
  SendReactionInput,
  UseRoomReturn,
} from '@/types/exam';
import { parseMarkdownQuestions } from '@/lib/markdown-parser';

const STORAGE_MEMBER_ID_KEY = 'exam_room_member_id_v1';
const STORAGE_ACTIVE_ROOM_KEY = 'exam_room_active_code_v1';
const BROADCAST_CHANNEL_NAME = 'exam_room_live_channel_v1';
const REACTION_TTL_MS = 6500;

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
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const channelRef = useRef<BroadcastChannel | null>(null);
  const roomCodeRef = useRef<string | null>(null);

  useEffect(() => {
    const id = getOrCreateLocalMemberId();
    setMemberId(id);
  }, []);

  useEffect(() => {
    roomCodeRef.current = room?.code || null;
  }, [room?.code]);

  // Periodic tick to expire old floating reactions smoothly
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Setup BroadcastChannel for instant zero-latency cross-tab sync on the same device
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
        incoming.code === roomCodeRef.current
      ) {
        setRoom((prev) => {
          if (!prev || incoming.version >= prev.version) {
            return incoming;
          }
          return prev;
        });
      }
    };

    return () => {
      bc.close();
      channelRef.current = null;
    };
  }, []);

  const applyAndBroadcastRoom = useCallback((nextRoom: RoomState | null) => {
    setRoom(nextRoom);
    if (typeof window !== 'undefined') {
      try {
        if (nextRoom) {
          window.localStorage.setItem(STORAGE_ACTIVE_ROOM_KEY, nextRoom.code);
          channelRef.current?.postMessage(nextRoom);
        } else {
          window.localStorage.removeItem(STORAGE_ACTIVE_ROOM_KEY);
        }
      } catch {
        // Ignore storage errors
      }
    }
  }, []);

  // Poll `/api/rooms/[code]` every 600ms while inside a room
  useEffect(() => {
    if (!room?.code) return;
    let cancelled = false;
    const code = room.code;

    const poll = async () => {
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.room) {
          setRoom((prev) => {
            if (!prev) return data.room;
            if (data.room.version >= prev.version) {
              return data.room;
            }
            return prev;
          });
        }
      } catch {
        // Ignore transient network poll errors
      }
    };

    const interval = setInterval(poll, 600);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [room?.code]);

  const clearError = useCallback(() => setError(null), []);

  const createRoom = useCallback(
    async (params: {
      name: string;
      avatar: string;
      title?: string;
      mode?: GameMode;
      withBots?: boolean;
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
            title: params.title,
            mode: params.mode || 'wait',
            withBots: params.withBots !== false,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.room) {
          throw new Error(data.error || 'Could not create room.');
        }
        applyAndBroadcastRoom(data.room);
        return data.room as RoomState;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create room';
        setError(msg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [memberId, applyAndBroadcastRoom]
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
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.room) {
          throw new Error(data.error || `Room "${cleanCode}" not found.`);
        }
        applyAndBroadcastRoom(data.room);
        return data.room as RoomState;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to join room';
        setError(msg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [memberId, applyAndBroadcastRoom]
  );

  const leaveRoom = useCallback(() => {
    applyAndBroadcastRoom(null);
    setError(null);
  }, [applyAndBroadcastRoom]);

  const postRoomAction = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      if (!room?.code) return;
      try {
        const activeMemberId = memberId || getOrCreateLocalMemberId();
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(room.code)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action,
              memberId: activeMemberId,
              fallbackRoom: room,
              ...payload,
            }),
          }
        );
        const data = await res.json();
        if (res.ok && data?.room) {
          applyAndBroadcastRoom(data.room);
        } else if (data?.error) {
          setError(data.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed');
      }
    },
    [room?.code, memberId, applyAndBroadcastRoom]
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
          }),
        });
        const data = (await res.json()) as ParseQuestionsResult & {
          error?: string;
        };
        if (!res.ok || !data.questions || data.questions.length === 0) {
          // Try client-side deterministic fallback just in case
          const fallback = parseMarkdownQuestions(params.markdown);
          if (fallback.questions.length === 0) {
            throw new Error(
              data.error ||
                fallback.warnings?.[0] ||
                'Could not parse any questions from the provided Markdown.'
            );
          }
          if (room?.code) {
            await setQuestions(fallback.questions, params.title);
          }
          return fallback;
        }

        if (room?.code) {
          await setQuestions(data.questions, params.title);
        }
        return data;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to parse Markdown';
        setError(msg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [room?.code, setQuestions]
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

  const addSimulatedMember = useCallback(
    async (personality?: Member['botPersonality']) => {
      await postRoomAction('addSimulatedMember', { personality });
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
    if (room.isRevealed || room.status === 'finished') return true;
    if (room.mode === 'race' && myCurrentAnswer !== null) return true;
    return false;
  }, [room, myCurrentAnswer]);

  const optionTags = useMemo<Record<number, MemberAnswerTag[]>>(() => {
    const map: Record<number, MemberAnswerTag[]> = { 0: [], 1: [], 2: [], 3: [] };
    if (!room || !currentQuestion) return map;

    currentQuestion.options.forEach((_, idx) => {
      map[idx] = [];
    });

    const qIdx = room.currentQuestionIndex;

    // Collect all members who answered this question, sorted by answeredAt asc
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

      // In 'wait' mode, before room.isRevealed is true, only show the local user's own tag on their selected option
      // Once room.isRevealed is true (or in 'race' mode), show everyone's member tags on the options!
      const canSeeTag =
        room.mode === 'race' || room.isRevealed || isMe;

      if (!canSeeTag) return;

      if (!map[ans.optionIndex]) {
        map[ans.optionIndex] = [];
      }
      map[ans.optionIndex].push({
        memberId: m.id,
        name: m.name,
        avatar: m.avatar,
        isMe,
        isBot: m.isBot,
        optionIndex: ans.optionIndex,
        isCorrect: ans.isCorrect,
        timeMs: ans.timeMs,
        pointsEarned: ans.pointsEarned,
        order: orderIdx + 1,
      });
    });

    return map;
  }, [room, currentQuestion, me]);

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
    createRoom,
    joinRoom,
    leaveRoom,
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
    addSimulatedMember,
    removeMember,
  };
}
