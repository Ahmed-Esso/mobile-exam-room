import {
  EmojiReaction,
  GameMode,
  Member,
  MemberAnswer,
  Question,
  RoomSettingsUpdate,
  RoomState,
  RoomStatus,
  SendReactionInput,
} from '@/types/exam';

interface GlobalRoomStore {
  rooms: Map<string, RoomState>;
}

const globalForRooms = globalThis as unknown as {
  __examRoomStoreV2?: GlobalRoomStore;
};

const TMP_STORE_PATH = '/tmp/exam-rooms-v2.json';

function loadDiskRooms(): Record<string, RoomState> {
  if (typeof window !== 'undefined') return {};
  try {
    const req = eval('require') as NodeRequire;
    const fs = req('fs');
    if (fs.existsSync(TMP_STORE_PATH)) {
      const raw = fs.readFileSync(TMP_STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, RoomState>;
      }
    }
  } catch {
    // Ignore disk read errors
  }
  return {};
}

function saveDiskRooms(rooms: Map<string, RoomState>) {
  if (typeof window !== 'undefined') return;
  try {
    const req = eval('require') as NodeRequire;
    const fs = req('fs');
    const obj: Record<string, RoomState> = {};
    for (const [k, v] of Array.from(rooms.entries())) {
      obj[k] = v;
    }
    fs.writeFileSync(TMP_STORE_PATH, JSON.stringify(obj), 'utf8');
  } catch {
    // Ignore disk write errors
  }
}

function getStore(): GlobalRoomStore {
  if (!globalForRooms.__examRoomStoreV2) {
    const rooms = new Map<string, RoomState>();
    const disk = loadDiskRooms();
    for (const [code, room] of Object.entries(disk)) {
      rooms.set(code, room);
    }
    globalForRooms.__examRoomStoreV2 = { rooms };
  } else if (typeof window === 'undefined') {
    // Merge any updates written to /tmp by sibling invocations on this container
    const disk = loadDiskRooms();
    for (const [code, diskRoom] of Object.entries(disk)) {
      const existing = globalForRooms.__examRoomStoreV2.rooms.get(code);
      if (!existing) {
        globalForRooms.__examRoomStoreV2.rooms.set(code, diskRoom);
      } else {
        globalForRooms.__examRoomStoreV2.rooms.set(
          code,
          mergeRoomStates(existing, diskRoom)
        );
      }
    }
  }
  return globalForRooms.__examRoomStoreV2;
}

function recomputeMemberStats(member: Member, questions: Question[]): Member {
  let score = 0;
  let streak = 0;
  let bestStreak = 0;
  let correctCount = 0;
  let totalTimeMs = 0;

  const sortedIndices = Object.keys(member.answers)
    .map((k) => Number(k))
    .filter((k) => Number.isFinite(k))
    .sort((a, b) => a - b);

  for (const qIdx of sortedIndices) {
    const ans = member.answers[qIdx];
    if (!ans) continue;
    const q = questions[qIdx];
    const isCorrect = q ? ans.optionIndex === q.correctIndex : ans.isCorrect;
    ans.isCorrect = isCorrect;
    totalTimeMs += ans.timeMs || 0;
    if (isCorrect) {
      score += ans.pointsEarned || 1000;
      correctCount += 1;
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      ans.pointsEarned = 0;
      ans.speedBonus = 0;
      streak = 0;
    }
  }

  return {
    ...member,
    score,
    streak,
    bestStreak,
    correctCount,
    totalTimeMs,
  };
}

const STATUS_RANK: Record<RoomStatus, number> = {
  lobby: 0,
  active: 1,
  finished: 2,
};

/**
 * Deterministic CRDT-style room state merger.
 * Works identically on both server and client so multi-phone rooms across
 * Vercel serverless instances and MQTT WebSockets never drop members or reveal early in Wait Mode.
 */
export function mergeRoomStates(a: RoomState, b: RoomState): RoomState {
  if (!a) return b;
  if (!b) return a;
  if (a.code !== b.code) return b;

  const sessionA = a.examSessionId || a.createdAt || 0;
  const sessionB = b.examSessionId || b.createdAt || 0;
  const latestSessionId = Math.max(sessionA, sessionB);
  const sameSession = sessionA === sessionB;

  // Primary state for room-level settings is the one with newer session or higher version/updatedAt
  const primary =
    sessionB > sessionA
      ? b
      : sessionA > sessionB
      ? a
      : b.version > a.version ||
        (b.version === a.version && b.updatedAt >= a.updatedAt)
      ? b
      : a;

  // Kicked member IDs union
  const kickedSet = new Set<string>([
    ...(a.kickedMemberIds || []),
    ...(b.kickedMemberIds || []),
  ]);

  // Questions: prefer newer questionsUpdatedAt, or non-empty questions array
  const qTimeA = a.questionsUpdatedAt || (a.questions.length > 0 ? a.updatedAt : 0);
  const qTimeB = b.questionsUpdatedAt || (b.questions.length > 0 ? b.updatedAt : 0);
  const useQuestionsB =
    (b.questions.length > 0 && a.questions.length === 0) ||
    (b.questions.length > 0 && qTimeB > qTimeA);
  const mergedQuestions = useQuestionsB ? b.questions : a.questions;
  const mergedQuestionsUpdatedAt = Math.max(qTimeA, qTimeB);

  // Determine authoritative hostId (prefer a member explicitly marked isHost: true)
  const hostFromA = a.members.find((m) => m.isHost)?.id;
  const hostFromB = b.members.find((m) => m.isHost)?.id;
  const mergedHostId = hostFromA || hostFromB || a.hostId || b.hostId;

  // Union of members by member.id (never drop a joined friend unless explicitly kicked)
  const memberMap = new Map<string, Member>();
  for (const m of a.members) {
    if (!kickedSet.has(m.id)) {
      memberMap.set(m.id, {
        ...m,
        answers: sessionA === latestSessionId ? { ...m.answers } : {},
      });
    }
  }

  for (const mB of b.members) {
    if (kickedSet.has(mB.id)) continue;
    const mA = memberMap.get(mB.id);
    const bAnswers = sessionB === latestSessionId ? { ...mB.answers } : {};

    if (!mA) {
      memberMap.set(mB.id, {
        ...mB,
        answers: bAnswers,
      });
    } else {
      const mergedAnswers: Record<number, MemberAnswer> = { ...mA.answers };
      for (const [qKey, ansB] of Object.entries(bAnswers)) {
        const qIdx = Number(qKey);
        const existingAns = mergedAnswers[qIdx];
        if (
          !existingAns ||
          (ansB && ansB.answeredAt < existingAns.answeredAt)
        ) {
          mergedAnswers[qIdx] = ansB;
        }
      }

      const newerMeta = mB.lastSeenAt >= mA.lastSeenAt ? mB : mA;
      memberMap.set(mB.id, {
        ...newerMeta,
        id: mB.id,
        name: newerMeta.name || mA.name || mB.name,
        avatar: newerMeta.avatar || mA.avatar || mB.avatar,
        isHost: mA.isHost || mB.isHost || mB.id === mergedHostId,
        statusBadge: newerMeta.statusBadge,
        joinedAt: Math.min(mA.joinedAt || Date.now(), mB.joinedAt || Date.now()),
        lastSeenAt: Math.max(mA.lastSeenAt || 0, mB.lastSeenAt || 0),
        answers: mergedAnswers,
      });
    }
  }

  // Sort members: host first, then by joinedAt
  const mergedMembers = Array.from(memberMap.values())
    .map((m) => ({
      ...recomputeMemberStats(m, mergedQuestions),
      isHost: m.id === mergedHostId || m.isHost,
    }))
    .sort((x, y) => {
      if (x.isHost !== y.isHost) return x.isHost ? -1 : 1;
      return x.joinedAt - y.joinedAt;
    });

  // Status & currentQuestionIndex resolution
  let mergedStatus: RoomStatus = primary.status;
  let mergedQuestionIndex = primary.currentQuestionIndex;
  let mergedQuestionStartedAt = primary.questionStartedAt;
  let mergedForceRevealed = primary.forceRevealedQuestionIndex ?? -1;

  if (sameSession) {
    mergedStatus =
      STATUS_RANK[b.status] > STATUS_RANK[a.status] ? b.status : a.status;
    if (mergedStatus === 'active') {
      if (b.currentQuestionIndex > a.currentQuestionIndex) {
        mergedQuestionIndex = b.currentQuestionIndex;
        mergedQuestionStartedAt = b.questionStartedAt;
      } else if (a.currentQuestionIndex > b.currentQuestionIndex) {
        mergedQuestionIndex = a.currentQuestionIndex;
        mergedQuestionStartedAt = a.questionStartedAt;
      } else {
        mergedQuestionIndex = a.currentQuestionIndex;
        mergedQuestionStartedAt = Math.min(
          a.questionStartedAt || Date.now(),
          b.questionStartedAt || Date.now()
        );
      }
    }
    mergedForceRevealed = Math.max(
      a.forceRevealedQuestionIndex ?? -1,
      b.forceRevealedQuestionIndex ?? -1
    );
  }

  // Merge reactions by id
  const reactionMap = new Map<string, EmojiReaction>();
  for (const rx of [...(a.reactions || []), ...(b.reactions || [])]) {
    if (rx && rx.id) {
      reactionMap.set(rx.id, rx);
    }
  }
  const mergedReactions = Array.from(reactionMap.values())
    .sort((x, y) => x.createdAt - y.createdAt)
    .slice(-40);

  // Strict Wait-Mode & Race-Mode Reveal Calculation
  const allAnswered =
    mergedMembers.length > 0 &&
    mergedMembers.every((m) => m.answers[mergedQuestionIndex] !== undefined);
  const isForceRevealed = mergedForceRevealed === mergedQuestionIndex;

  let mergedIsRevealed = false;
  if (mergedStatus === 'finished') {
    mergedIsRevealed = true;
  } else if (mergedStatus === 'active') {
    // Strictly require either explicit host Force Reveal on this question OR every member in the room having answered
    mergedIsRevealed = isForceRevealed || allAnswered;
  }

  return {
    code: a.code,
    title:
      primary.title && primary.title !== 'Live Exam Room'
        ? primary.title
        : b.title !== 'Live Exam Room'
        ? b.title
        : a.title || 'Live Exam Room',
    status: mergedStatus,
    mode: primary.mode,
    timePerQuestion: primary.timePerQuestion || 30,
    hostId: mergedHostId || (mergedMembers[0]?.id ?? ''),
    currentQuestionIndex: mergedQuestionIndex,
    questionStartedAt: mergedQuestionStartedAt,
    examSessionId: latestSessionId,
    forceRevealedQuestionIndex: mergedForceRevealed,
    questionsUpdatedAt: mergedQuestionsUpdatedAt,
    kickedMemberIds: Array.from(kickedSet),
    isRevealed: mergedIsRevealed,
    questions: mergedQuestions,
    members: mergedMembers,
    reactions: mergedReactions,
    version: Math.max(a.version || 1, b.version || 1),
    createdAt: Math.min(a.createdAt || Date.now(), b.createdAt || Date.now()),
    updatedAt: Math.max(a.updatedAt || Date.now(), b.updatedAt || Date.now()),
  };
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
  const maxAgeMs = 1000 * 60 * 60 * 6; // 6 hours
  let changed = false;
  for (const [code, room] of Array.from(store.rooms.entries())) {
    if (now - room.updatedAt > maxAgeMs) {
      store.rooms.delete(code);
      changed = true;
    }
  }
  if (changed) {
    saveDiskRooms(store.rooms);
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

  const allAnswered =
    room.members.length > 0 &&
    room.members.every((m) => m.answers[qIdx] !== undefined);

  room.isRevealed =
    room.forceRevealedQuestionIndex === qIdx || allAnswered;
  room.version += 1;
  room.updatedAt = Date.now();
  return true;
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

export function createRoomInStore(params: {
  memberId: string;
  name: string;
  avatar: string;
  title?: string;
  mode?: GameMode;
}): RoomState {
  pruneOldRooms();
  const store = getStore();
  const code = generateRoomCode();
  const now = Date.now();

  const hostMember: Member = {
    id: params.memberId,
    name: params.name.trim() || 'Player 1',
    avatar: params.avatar || '🐥',
    isHost: true,
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
    title: params.title?.trim() || 'Live Exam Room',
    status: 'lobby',
    mode: params.mode || 'wait',
    timePerQuestion: 30,
    hostId: hostMember.id,
    currentQuestionIndex: 0,
    questionStartedAt: now,
    examSessionId: now,
    forceRevealedQuestionIndex: -1,
    questionsUpdatedAt: 0,
    kickedMemberIds: [],
    isRevealed: false,
    questions: [],
    members: [hostMember],
    reactions: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  store.rooms.set(code, room);
  saveDiskRooms(store.rooms);
  return room;
}

export function getRoomFromStore(code: string): RoomState | null {
  const store = getStore();
  const cleanCode = code.trim().toUpperCase();
  return store.rooms.get(cleanCode) || null;
}

export function joinRoomInStore(params: {
  code: string;
  memberId: string;
  name: string;
  avatar: string;
}): RoomState | null {
  const store = getStore();
  const cleanCode = params.code.trim().toUpperCase();
  if (!cleanCode || cleanCode.length < 4) return null;

  const now = Date.now();
  let room = store.rooms.get(cleanCode);

  if (!room) {
    // If joining on a different serverless lambda instance before state syncs,
    // create a joinable room stub so the joining peer immediately connects via MQTT & syncs with the host
    const joiningMember: Member = {
      id: params.memberId,
      name: params.name.trim() || 'Player',
      avatar: params.avatar || '🐥',
      isHost: false,
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
    room = {
      code: cleanCode,
      title: 'Live Exam Room',
      status: 'lobby',
      mode: 'wait',
      timePerQuestion: 30,
      hostId: '',
      currentQuestionIndex: 0,
      questionStartedAt: now,
      examSessionId: 0,
      forceRevealedQuestionIndex: -1,
      questionsUpdatedAt: 0,
      kickedMemberIds: [],
      isRevealed: false,
      questions: [],
      members: [joiningMember],
      reactions: [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    store.rooms.set(cleanCode, room);
    saveDiskRooms(store.rooms);
    return room;
  }

  // Ensure member is removed from kickedMemberIds if rejoining
  if (room.kickedMemberIds?.includes(params.memberId)) {
    room.kickedMemberIds = room.kickedMemberIds.filter(
      (id) => id !== params.memberId
    );
  }

  const existing = room.members.find((m) => m.id === params.memberId);
  if (existing) {
    existing.name = params.name.trim() || existing.name;
    existing.avatar = params.avatar || existing.avatar;
    existing.lastSeenAt = now;
  } else {
    const newMember: Member = {
      id: params.memberId,
      name: params.name.trim() || `Player ${room.members.length + 1}`,
      avatar: params.avatar || '🐥',
      isHost: false,
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

  // Re-evaluate reveal state when a new member joins an active Wait-mode question
  if (room.status === 'active') {
    const qIdx = room.currentQuestionIndex;
    const allAnswered =
      room.members.length > 0 &&
      room.members.every((m) => m.answers[qIdx] !== undefined);
    room.isRevealed =
      room.forceRevealedQuestionIndex === qIdx || allAnswered;
  }

  room.version += 1;
  room.updatedAt = now;
  store.rooms.set(cleanCode, room);
  saveDiskRooms(store.rooms);
  return room;
}

export function mutateRoomInStore(
  code: string,
  action: string,
  payload: Record<string, unknown>
): RoomState | null {
  const store = getStore();
  const cleanCode = code.trim().toUpperCase();
  let room = store.rooms.get(cleanCode);

  if (payload.fallbackRoom && typeof payload.fallbackRoom === 'object') {
    const clientRoom = payload.fallbackRoom as RoomState;
    if (clientRoom.code === cleanCode && Array.isArray(clientRoom.members)) {
      room = room ? mergeRoomStates(room, clientRoom) : clientRoom;
      store.rooms.set(cleanCode, room);
    }
  }

  if (!room) return null;

  const now = Date.now();
  const memberId = typeof payload.memberId === 'string' ? payload.memberId : '';
  const actingMember = room.members.find((m) => m.id === memberId);
  if (actingMember) {
    actingMember.lastSeenAt = now;
  }

  if (action === 'sync') {
    saveDiskRooms(store.rooms);
    return room;
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
      room.version += 1;
      room.updatedAt = now;
      break;
    }

    case 'setQuestions': {
      const questions = payload.questions as Question[];
      if (Array.isArray(questions)) {
        room.questions = questions;
        room.questionsUpdatedAt = now;
        if (typeof payload.title === 'string' && payload.title.trim()) {
          room.title = payload.title.trim();
        }
        room.currentQuestionIndex = 0;
        room.forceRevealedQuestionIndex = -1;
        room.isRevealed = false;
        room.version += 1;
        room.updatedAt = now;
      }
      break;
    }

    case 'startExam': {
      if (room.questions.length === 0) {
        break;
      }
      if (payload.mode === 'wait' || payload.mode === 'race') {
        room.mode = payload.mode;
      }
      room.status = 'active';
      room.currentQuestionIndex = 0;
      room.questionStartedAt = now;
      room.examSessionId = now;
      room.forceRevealedQuestionIndex = -1;
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
        room.forceRevealedQuestionIndex = room.currentQuestionIndex;
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
          room.forceRevealedQuestionIndex = -1;
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
      room.examSessionId = now;
      room.forceRevealedQuestionIndex = -1;
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

    case 'removeMember': {
      const targetId = String(payload.targetMemberId || '');
      if (targetId && room.members.length > 1) {
        room.kickedMemberIds = Array.from(
          new Set([...(room.kickedMemberIds || []), targetId])
        );
        room.members = room.members.filter((m) => m.id !== targetId);
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

  store.rooms.set(cleanCode, room);
  saveDiskRooms(store.rooms);
  return room;
}
