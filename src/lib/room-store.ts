import {
  EmojiReaction,
  GameMode,
  Member,
  MemberAnswer,
  Question,
  RoomSettingsUpdate,
  RoomState,
  SendReactionInput,
} from '@/types/exam';
import { DEFAULT_QUESTIONS, DEFAULT_SAMPLE_PACK } from './sample-exams';

const BOT_ROSTER: Array<{
  name: string;
  avatar: string;
  personality: NonNullable<Member['botPersonality']>;
}> = [
  { name: 'Sara', avatar: '🐼', personality: 'genius' },
  { name: 'Omar', avatar: '🦁', personality: 'speedster' },
  { name: 'Maya', avatar: '🐸', personality: 'careful' },
  { name: 'Leo', avatar: '🦉', personality: 'genius' },
  { name: 'Zara', avatar: '🐙', personality: 'wildcard' },
  { name: 'Kai', avatar: '🐯', personality: 'speedster' },
  { name: 'Chloe', avatar: '🦄', personality: 'careful' },
  { name: 'Max', avatar: '🦖', personality: 'wildcard' },
];

interface GlobalRoomStore {
  rooms: Map<string, RoomState>;
  /** Keyed by `${roomCode}:${questionIndex}:${botId}` -> scheduled delay ms */
  botSchedules: Map<string, { delayMs: number; optionIndex: number; reacted?: boolean }>;
}

const globalForRooms = globalThis as unknown as {
  __examRoomStore?: GlobalRoomStore;
};

function getStore(): GlobalRoomStore {
  if (!globalForRooms.__examRoomStore) {
    globalForRooms.__examRoomStore = {
      rooms: new Map<string, RoomState>(),
      botSchedules: new Map(),
    };
  }
  return globalForRooms.__examRoomStore;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const store = getStore();
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!store.rooms.has(code)) {
      return code;
    }
  }
  return 'EXAM' + Math.floor(10 + Math.random() * 89);
}

function pruneOldRooms() {
  const store = getStore();
  const now = Date.now();
  const maxAgeMs = 1000 * 60 * 60 * 4; // 4 hours
  for (const [code, room] of Array.from(store.rooms.entries())) {
    if (now - room.updatedAt > maxAgeMs) {
      store.rooms.delete(code);
    }
  }
}

function computePoints(
  room: RoomState,
  member: Member,
  isCorrect: boolean,
  timeMs: number,
  questionIndex: number
): { pointsEarned: number; speedBonus: number } {
  if (!isCorrect) {
    return { pointsEarned: 0, speedBonus: 0 };
  }

  const basePoints = 1000;
  const maxTimeMs = (room.timePerQuestion || 30) * 1000;
  const timeRatio = Math.max(0, Math.min(1, 1 - timeMs / maxTimeMs));

  // Count how many members already answered this question correctly before this member
  const priorCorrectCount = room.members.filter((m) => {
    if (m.id === member.id) return false;
    const ans = m.answers[questionIndex];
    return ans && ans.isCorrect;
  }).length;

  let speedBonus = 0;
  if (room.mode === 'race') {
    const rankBonus =
      priorCorrectCount === 0
        ? 500
        : priorCorrectCount === 1
        ? 300
        : priorCorrectCount === 2
        ? 150
        : 50;
    const timeBonus = Math.round(timeRatio * 300);
    speedBonus = rankBonus + timeBonus;
  } else {
    // Wait mode still rewards quick lock-in + streak bonus
    const timeBonus = Math.round(timeRatio * 250);
    const streakBonus = Math.min(400, member.streak * 100);
    speedBonus = timeBonus + streakBonus;
  }

  return {
    pointsEarned: basePoints + speedBonus,
    speedBonus,
  };
}

function recordMemberAnswerInternal(
  room: RoomState,
  member: Member,
  optionIndex: number,
  answeredAt: number
): boolean {
  const qIdx = room.currentQuestionIndex;
  const currentQ = room.questions[qIdx];
  if (!currentQ) return false;

  // Already answered this question
  if (member.answers[qIdx] !== undefined) {
    return false;
  }

  const safeOpt = Math.max(0, Math.min(currentQ.options.length - 1, optionIndex));
  const timeMs = Math.max(250, answeredAt - room.questionStartedAt);
  const isCorrect = safeOpt === currentQ.correctIndex;
  const { pointsEarned, speedBonus } = computePoints(
    room,
    member,
    isCorrect,
    timeMs,
    qIdx
  );

  const answerRecord: MemberAnswer = {
    questionIndex: qIdx,
    optionIndex: safeOpt,
    answeredAt,
    timeMs,
    isCorrect,
    pointsEarned,
    speedBonus,
  };

  member.answers[qIdx] = answerRecord;
  member.totalTimeMs += timeMs;
  member.lastSeenAt = answeredAt;

  if (isCorrect) {
    member.score += pointsEarned;
    member.streak += 1;
    member.bestStreak = Math.max(member.bestStreak, member.streak);
    member.correctCount += 1;
  } else {
    member.streak = 0;
  }

  // Check if all members have answered
  const allAnswered =
    room.members.length > 0 &&
    room.members.every((m) => m.answers[qIdx] !== undefined);

  if (allAnswered && !room.isRevealed) {
    room.isRevealed = true;
  }

  room.version += 1;
  room.updatedAt = Date.now();
  return true;
}

function getOrCreateBotSchedule(
  room: RoomState,
  bot: Member,
  questionIndex: number
): { delayMs: number; optionIndex: number; reacted?: boolean } {
  const store = getStore();
  const key = `${room.code}:${questionIndex}:${bot.id}`;
  const existing = store.botSchedules.get(key);
  if (existing) return existing;

  const q = room.questions[questionIndex];
  const numOptions = q ? q.options.length : 4;
  const correctIdx = q ? q.correctIndex : 0;

  let accuracy = 0.72;
  let minDelay = 2000;
  let maxDelay = 6200;

  switch (bot.botPersonality) {
    case 'genius':
      accuracy = 0.88;
      minDelay = 2400;
      maxDelay = 5200;
      break;
    case 'speedster':
      accuracy = 0.7;
      minDelay = 1300;
      maxDelay = 3500;
      break;
    case 'careful':
      accuracy = 0.82;
      minDelay = 3200;
      maxDelay = 6800;
      break;
    case 'wildcard':
      accuracy = 0.58;
      minDelay = 1600;
      maxDelay = 5800;
      break;
  }

  const willBeCorrect = Math.random() < accuracy;
  let chosenOption = correctIdx;
  if (!willBeCorrect && numOptions > 1) {
    const wrongOptions = Array.from({ length: numOptions }, (_, i) => i).filter(
      (i) => i !== correctIdx
    );
    chosenOption = wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
  }

  const delayMs = Math.floor(minDelay + Math.random() * (maxDelay - minDelay));
  const schedule = { delayMs, optionIndex: chosenOption, reacted: false };
  store.botSchedules.set(key, schedule);
  return schedule;
}

/**
 * Advances simulated bot answers & contextual reactions based on elapsed wall-clock time.
 * Called automatically whenever a room is read or mutated.
 */
export function tickRoomSimulation(room: RoomState): RoomState {
  if (room.status !== 'active' || !room.autoSimulateBots) {
    return room;
  }

  const now = Date.now();
  const qIdx = room.currentQuestionIndex;
  const elapsed = now - room.questionStartedAt;
  const bots = room.members.filter((m) => m.isBot);

  if (bots.length === 0) return room;

  for (const bot of bots) {
    const sched = getOrCreateBotSchedule(room, bot, qIdx);
    if (bot.answers[qIdx] === undefined && elapsed >= sched.delayMs) {
      const answeredAt = room.questionStartedAt + sched.delayMs;
      recordMemberAnswerInternal(room, bot, sched.optionIndex, answeredAt);
    }
  }

  // If question is revealed (or in race mode after a human answers), let one bot occasionally send a fun reaction
  const humans = room.members.filter((m) => !m.isBot);
  const humanAnswered = humans.find((h) => h.answers[qIdx] !== undefined);

  if (humanAnswered && (room.isRevealed || room.mode === 'race')) {
    const humanAns = humanAnswered.answers[qIdx];
    for (const bot of bots) {
      const sched = getOrCreateBotSchedule(room, bot, qIdx);
      const botAns = bot.answers[qIdx];
      if (!botAns || sched.reacted) continue;

      // Mark as considered so we only trigger once per question per bot
      sched.reacted = true;

      // 45% chance for a bot to send a contextual or celebratory reaction
      if (Math.random() < 0.45) {
        if (humanAns.isCorrect && !botAns.isCorrect) {
          const choices = [
            { emoji: '💀', label: 'How?!' },
            { emoji: '🫡', label: 'Teach me' },
            { emoji: '🧠', label: 'Big brain' },
          ];
          const pick = choices[Math.floor(Math.random() * choices.length)];
          pushReactionInternal(room, bot, {
            emoji: pick.emoji,
            label: pick.label,
            kind: 'contextual-wrong-right',
            targetMemberId: humanAnswered.id,
            questionIndex: qIdx,
          });
        } else if (humanAns.isCorrect && botAns.isCorrect) {
          const choices = [
            { emoji: '🤝', label: 'Twin brain!' },
            { emoji: '🔥', label: 'We cooked' },
          ];
          const pick = choices[Math.floor(Math.random() * choices.length)];
          pushReactionInternal(room, bot, {
            emoji: pick.emoji,
            label: pick.label,
            kind: 'contextual-both-right',
            targetMemberId: humanAnswered.id,
            questionIndex: qIdx,
          });
        }
      }
    }
  }

  return room;
}

function pushReactionInternal(
  room: RoomState,
  sender: Member,
  input: SendReactionInput
): EmojiReaction {
  const target = input.targetMemberId
    ? room.members.find((m) => m.id === input.targetMemberId)
    : undefined;

  const reaction: EmojiReaction = {
    id: `rx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    senderId: sender.id,
    senderName: sender.name,
    senderAvatar: sender.avatar,
    emoji: input.emoji,
    label: input.label,
    kind: input.kind || 'general',
    targetMemberId: target?.id,
    targetMemberName: target?.name,
    targetMemberAvatar: target?.avatar,
    questionIndex:
      input.questionIndex !== undefined
        ? input.questionIndex
        : room.currentQuestionIndex,
    createdAt: Date.now(),
  };

  room.reactions.push(reaction);
  if (room.reactions.length > 40) {
    room.reactions = room.reactions.slice(-40);
  }
  room.version += 1;
  room.updatedAt = Date.now();
  return reaction;
}

function createBotMember(
  room: RoomState,
  personalityOverride?: Member['botPersonality']
): Member {
  const existingNames = new Set(room.members.map((m) => m.name.toLowerCase()));
  const candidate =
    BOT_ROSTER.find((b) => !existingNames.has(b.name.toLowerCase())) ||
    BOT_ROSTER[Math.floor(Math.random() * BOT_ROSTER.length)];

  const suffix = existingNames.has(candidate.name.toLowerCase())
    ? ` ${room.members.filter((m) => m.isBot).length + 1}`
    : '';

  const now = Date.now();
  return {
    id: `bot-${now}-${Math.random().toString(36).slice(2, 7)}`,
    name: `${candidate.name}${suffix}`,
    avatar: candidate.avatar,
    isHost: false,
    isBot: true,
    botPersonality: personalityOverride || candidate.personality,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correctCount: 0,
    totalTimeMs: 0,
    statusBadge: null,
    joinedAt: now,
    lastSeenAt: now,
    answers: {},
  };
}

export function createRoomInStore(params: {
  memberId: string;
  name: string;
  avatar: string;
  title?: string;
  mode?: GameMode;
  withBots?: boolean;
}): RoomState {
  pruneOldRooms();
  const store = getStore();
  const code = generateRoomCode();
  const now = Date.now();

  const hostMember: Member = {
    id: params.memberId,
    name: params.name.trim() || 'Player 1',
    avatar: params.avatar || '🦊',
    isHost: true,
    isBot: false,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correctCount: 0,
    totalTimeMs: 0,
    statusBadge: null,
    joinedAt: now,
    lastSeenAt: now,
    answers: {},
  };

  const room: RoomState = {
    code,
    title: params.title?.trim() || DEFAULT_SAMPLE_PACK.title,
    status: 'lobby',
    mode: params.mode || 'wait',
    timePerQuestion: 30,
    autoSimulateBots: true,
    hostId: hostMember.id,
    currentQuestionIndex: 0,
    questionStartedAt: now,
    isRevealed: false,
    questions: [...DEFAULT_QUESTIONS],
    members: [hostMember],
    reactions: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  if (params.withBots !== false) {
    room.members.push(createBotMember(room, 'genius'));
    room.members.push(createBotMember(room, 'speedster'));
  }

  store.rooms.set(code, room);
  return room;
}

export function getRoomFromStore(code: string): RoomState | null {
  const store = getStore();
  const cleanCode = code.trim().toUpperCase();
  const room = store.rooms.get(cleanCode);
  if (!room) return null;
  return tickRoomSimulation(room);
}

export function joinRoomInStore(params: {
  code: string;
  memberId: string;
  name: string;
  avatar: string;
}): RoomState | null {
  const store = getStore();
  const cleanCode = params.code.trim().toUpperCase();
  const room = store.rooms.get(cleanCode);
  if (!room) return null;

  const now = Date.now();
  const existing = room.members.find((m) => m.id === params.memberId);
  if (existing) {
    existing.name = params.name.trim() || existing.name;
    existing.avatar = params.avatar || existing.avatar;
    existing.lastSeenAt = now;
  } else {
    const newMember: Member = {
      id: params.memberId,
      name: params.name.trim() || `Player ${room.members.length + 1}`,
      avatar: params.avatar || '🐼',
      isHost: false,
      isBot: false,
      score: 0,
      streak: 0,
      bestStreak: 0,
      correctCount: 0,
      totalTimeMs: 0,
      statusBadge: null,
      joinedAt: now,
      lastSeenAt: now,
      answers: {},
    };
    room.members.push(newMember);
  }

  room.version += 1;
  room.updatedAt = now;
  return tickRoomSimulation(room);
}

export function mutateRoomInStore(
  code: string,
  action: string,
  payload: Record<string, unknown>
): RoomState | null {
  const store = getStore();
  const cleanCode = code.trim().toUpperCase();
  let room = store.rooms.get(cleanCode);
  if (!room && payload.fallbackRoom && typeof payload.fallbackRoom === 'object') {
    const hydrated = payload.fallbackRoom as RoomState;
    if (hydrated.code === cleanCode && Array.isArray(hydrated.members)) {
      store.rooms.set(cleanCode, hydrated);
      room = hydrated;
    }
  }
  if (!room) return null;

  const now = Date.now();
  const memberId = typeof payload.memberId === 'string' ? payload.memberId : '';
  const actingMember = room.members.find((m) => m.id === memberId);
  if (actingMember) {
    actingMember.lastSeenAt = now;
  }

  switch (action) {
    case 'updateSettings': {
      const settings = (payload.settings || payload) as RoomSettingsUpdate;
      if (typeof settings.title === 'string' && settings.title.trim()) {
        room.title = settings.title.trim();
      }
      if (settings.mode === 'wait' || settings.mode === 'race') {
        room.mode = settings.mode;
      }
      if (typeof settings.timePerQuestion === 'number') {
        room.timePerQuestion = Math.max(5, Math.min(180, settings.timePerQuestion));
      }
      if (typeof settings.autoSimulateBots === 'boolean') {
        room.autoSimulateBots = settings.autoSimulateBots;
      }
      room.version += 1;
      room.updatedAt = now;
      break;
    }

    case 'setQuestions': {
      const questions = payload.questions as Question[];
      if (Array.isArray(questions) && questions.length > 0) {
        room.questions = questions;
        if (typeof payload.title === 'string' && payload.title.trim()) {
          room.title = payload.title.trim();
        }
        room.currentQuestionIndex = 0;
        room.isRevealed = false;
        room.version += 1;
        room.updatedAt = now;
      }
      break;
    }

    case 'startExam': {
      if (payload.mode === 'wait' || payload.mode === 'race') {
        room.mode = payload.mode;
      }
      room.status = 'active';
      room.currentQuestionIndex = 0;
      room.questionStartedAt = now;
      room.isRevealed = false;
      room.reactions = [];
      for (const m of room.members) {
        m.score = 0;
        m.streak = 0;
        m.bestStreak = 0;
        m.correctCount = 0;
        m.totalTimeMs = 0;
        m.answers = {};
      }
      // Clear previous bot schedules for this room
      for (const k of Array.from(store.botSchedules.keys())) {
        if (k.startsWith(`${room.code}:`)) {
          store.botSchedules.delete(k);
        }
      }
      room.version += 1;
      room.updatedAt = now;
      break;
    }

    case 'submitAnswer': {
      const optionIndex = Number(payload.optionIndex ?? 0);
      if (actingMember && room.status === 'active') {
        recordMemberAnswerInternal(room, actingMember, optionIndex, now);
      }
      break;
    }

    case 'revealQuestion': {
      if (room.status === 'active') {
        const qIdx = room.currentQuestionIndex;
        // Have any unanswered bots lock in their scheduled choice immediately
        for (const m of room.members) {
          if (m.isBot && m.answers[qIdx] === undefined) {
            const sched = getOrCreateBotSchedule(room, m, qIdx);
            recordMemberAnswerInternal(room, m, sched.optionIndex, now);
          }
        }
        room.isRevealed = true;
        room.version += 1;
        room.updatedAt = now;
      }
      break;
    }

    case 'nextQuestion': {
      if (room.status === 'active') {
        if (room.currentQuestionIndex + 1 < room.questions.length) {
          room.currentQuestionIndex += 1;
          room.questionStartedAt = now;
          room.isRevealed = false;
        } else {
          room.status = 'finished';
          room.isRevealed = true;
        }
        room.version += 1;
        room.updatedAt = now;
      }
      break;
    }

    case 'resetRoom': {
      const backToLobby = payload.backToLobby !== false;
      room.status = backToLobby ? 'lobby' : 'active';
      room.currentQuestionIndex = 0;
      room.questionStartedAt = now;
      room.isRevealed = false;
      room.reactions = [];
      for (const m of room.members) {
        m.score = 0;
        m.streak = 0;
        m.bestStreak = 0;
        m.correctCount = 0;
        m.totalTimeMs = 0;
        m.answers = {};
      }
      for (const k of Array.from(store.botSchedules.keys())) {
        if (k.startsWith(`${room.code}:`)) {
          store.botSchedules.delete(k);
        }
      }
      room.version += 1;
      room.updatedAt = now;
      break;
    }

    case 'sendReaction': {
      const sender = actingMember || room.members[0];
      if (sender) {
        const input = (payload.reaction || payload) as SendReactionInput;
        if (input && typeof input.emoji === 'string') {
          pushReactionInternal(room, sender, input);
        }
      }
      break;
    }

    case 'setStatusBadge': {
      if (actingMember) {
        const badge =
          typeof payload.badge === 'string' && payload.badge.trim()
            ? payload.badge.trim()
            : null;
        actingMember.statusBadge = badge;
        if (badge) {
          pushReactionInternal(room, actingMember, {
            emoji: badge,
            label: 'Status',
            kind: 'status',
          });
        }
        room.version += 1;
        room.updatedAt = now;
      }
      break;
    }

    case 'addSimulatedMember': {
      const personality = payload.personality as Member['botPersonality'];
      const bot = createBotMember(room, personality);
      room.members.push(bot);
      room.version += 1;
      room.updatedAt = now;
      break;
    }

    case 'removeMember': {
      const targetId = String(payload.targetMemberId || '');
      if (targetId && room.members.length > 1) {
        room.members = room.members.filter((m) => m.id !== targetId);
        // Check if all remaining members have answered current question
        const qIdx = room.currentQuestionIndex;
        if (
          room.status === 'active' &&
          !room.isRevealed &&
          room.members.every((m) => m.answers[qIdx] !== undefined)
        ) {
          room.isRevealed = true;
        }
        room.version += 1;
        room.updatedAt = now;
      }
      break;
    }
  }

  return tickRoomSimulation(room);
}
