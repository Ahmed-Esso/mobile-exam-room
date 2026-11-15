export type GameMode = 'wait' | 'race';

export type RoomStatus = 'lobby' | 'active' | 'finished';

export type ReactionKind =
  | 'general'
  | 'contextual-wrong-right'
  | 'contextual-both-right'
  | 'contextual-cheer'
  | 'status';

export interface Question {
  id: string;
  prompt: string;
  codeSnippet?: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  category?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  timeLimitSeconds?: number;
}

export interface MemberAnswer {
  questionIndex: number;
  optionIndex: number;
  answeredAt: number;
  timeMs: number;
  isCorrect: boolean;
  pointsEarned: number;
  speedBonus: number;
}

export interface Member {
  id: string;
  name: string;
  avatar: string;
  isHost: boolean;
  isBot: boolean;
  botPersonality?: 'genius' | 'speedster' | 'careful' | 'wildcard';
  score: number;
  streak: number;
  bestStreak: number;
  correctCount: number;
  totalTimeMs: number;
  statusBadge?: string | null;
  joinedAt: number;
  lastSeenAt: number;
  /** Map of questionIndex -> MemberAnswer */
  answers: Record<number, MemberAnswer>;
}

export interface MemberAnswerTag {
  memberId: string;
  name: string;
  avatar: string;
  isMe: boolean;
  isBot: boolean;
  optionIndex: number;
  isCorrect: boolean;
  timeMs: number;
  pointsEarned: number;
  /** 1-based order in which this member answered the question */
  order: number;
}

export interface EmojiReaction {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  emoji: string;
  label?: string;
  kind: ReactionKind;
  targetMemberId?: string;
  targetMemberName?: string;
  targetMemberAvatar?: string;
  questionIndex?: number;
  createdAt: number;
}

export interface RoomSettingsUpdate {
  title?: string;
  mode?: GameMode;
  timePerQuestion?: number;
  autoSimulateBots?: boolean;
}

export interface RoomState {
  code: string;
  title: string;
  status: RoomStatus;
  mode: GameMode;
  timePerQuestion: number;
  autoSimulateBots: boolean;
  hostId: string;
  currentQuestionIndex: number;
  questionStartedAt: number;
  /**
   * In 'wait' mode: becomes true when all members have answered or host clicks Force Reveal.
   * In 'race' mode: becomes true when all members have answered or host clicks Force Reveal
   * (individual racers also see immediate feedback upon locking in their own answer).
   */
  isRevealed: boolean;
  questions: Question[];
  members: Member[];
  reactions: EmojiReaction[];
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface ContextualReactionPreset {
  id: string;
  emoji: string;
  label: string;
  kind: ReactionKind;
  description: string;
}

export interface SampleExamPack {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  icon: string;
  questionCount: number;
  estimatedMinutes: number;
  markdown: string;
}

export interface ParseQuestionsResult {
  questions: Question[];
  source: 'markdown' | 'gemini';
  warnings?: string[];
}

export interface SendReactionInput {
  emoji: string;
  label?: string;
  kind?: ReactionKind;
  targetMemberId?: string;
  questionIndex?: number;
}

export interface UseRoomReturn {
  /** Full synchronized room state, or null when on landing screen */
  room: RoomState | null;
  /** Current local player's Member object */
  me: Member | null;
  /** True if the current local player is the room host */
  isHost: boolean;
  /** Loading state during create/join/fetch */
  isLoading: boolean;
  /** Last error message if an action failed */
  error: string | null;
  /** Clear current error */
  clearError: () => void;

  // Derived current question helpers
  /** Current active Question object (or null if in lobby/finished) */
  currentQuestion: Question | null;
  /** Local member's answer for the current question, if submitted */
  myCurrentAnswer: MemberAnswer | null;
  /**
   * True when the current question's correct answer, explanation, and peer tags
   * should be shown to the local user:
   * - In 'wait' mode: true only when room.isRevealed is true (all members answered or forced reveal)
   * - In 'race' mode: true as soon as the local member has answered OR room.isRevealed is true
   */
  isAnswerRevealedToMe: boolean;
  /**
   * Map of optionIndex (0..N) -> MemberAnswerTag[] for the current question.
   * Respects mode visibility rules (in 'wait' mode before reveal, only shows local user's own tag;
   * after reveal or in 'race' mode, shows all members who picked each option).
   */
  optionTags: Record<number, MemberAnswerTag[]>;
  /** Number of members who have locked in an answer for the current question */
  answeredCount: number;
  /** Total number of members in the room */
  totalMembersCount: number;
  /** Members who haveNOT answered the current question yet */
  waitingOnMembers: Member[];
  /**
   * Members who got the current question RIGHT while the local user got it WRONG.
   * Useful for triggering the contextual "They got it right & you missed it!" reaction strip.
   */
  peersWhoGotItRightWhenIMissed: Member[];
  /**
   * Members who ALSO got the current question RIGHT when the local user got it right.
   * Useful for "Twin brain!" / cheering contextual reactions.
   */
  peersWhoGotItRightWithMe: Member[];
  /** Sorted leaderboard of members (by score desc, then totalTimeMs asc) */
  leaderboard: Member[];
  /** Active floating reactions from the last ~6 seconds */
  activeReactions: EmojiReaction[];

  // Room Lifecycle & Actions
  createRoom: (params: {
    name: string;
    avatar: string;
    title?: string;
    mode?: GameMode;
    withBots?: boolean;
  }) => Promise<RoomState | null>;
  joinRoom: (params: {
    code: string;
    name: string;
    avatar: string;
  }) => Promise<RoomState | null>;
  leaveRoom: () => void;
  updateSettings: (settings: RoomSettingsUpdate) => Promise<void>;
  setQuestions: (questions: Question[], title?: string) => Promise<void>;
  parseAndSetMarkdown: (params: {
    markdown: string;
    title?: string;
    useGemini?: boolean;
    apiKey?: string;
  }) => Promise<ParseQuestionsResult | null>;
  startExam: (modeOverride?: GameMode) => Promise<void>;
  submitAnswer: (optionIndex: number) => Promise<void>;
  revealQuestion: () => Promise<void>;
  nextQuestion: () => Promise<void>;
  resetRoom: (backToLobby?: boolean) => Promise<void>;
  sendReaction: (input: SendReactionInput | string) => Promise<void>;
  setStatusBadge: (badge: string | null) => Promise<void>;
  addSimulatedMember: (personality?: Member['botPersonality']) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
}

export const AVATAR_OPTIONS: string[] = [
  '🦊',
  '🐼',
  '🦁',
  '🐸',
  '🦉',
  '🐙',
  '🦄',
  '🐯',
  '🐨',
  '🦖',
  '🐝',
  '🐧',
  '🦋',
  '🐬',
  '🐺',
  '🐱',
];

export const ZOOM_REACTIONS: string[] = [
  '😂',
  '🔥',
  '👏',
  '❤️',
  '🎉',
  '🤔',
  '💀',
  '😭',
  '🫡',
];

export const STATUS_BADGES: { emoji: string; label: string }[] = [
  { emoji: '✋', label: 'Raise Hand' },
  { emoji: '🔥', label: 'On Fire' },
  { emoji: '🤔', label: 'Thinking Hard' },
  { emoji: '⚡', label: 'Speed Demon' },
  { emoji: '☕', label: 'Need Coffee' },
];

export const CONTEXTUAL_PEER_RIGHT_REACTIONS: ContextualReactionPreset[] = [
  {
    id: 'how',
    emoji: '💀',
    label: 'How?!',
    kind: 'contextual-wrong-right',
    description: 'Bro how did you know that?!',
  },
  {
    id: 'teach-me',
    emoji: '🫡',
    label: 'Teach me',
    kind: 'contextual-wrong-right',
    description: 'Mad respect for getting that right',
  },
  {
    id: 'lucky',
    emoji: '😤',
    label: 'Lucky!',
    kind: 'contextual-wrong-right',
    description: '100% pure lucky guess!',
  },
  {
    id: 'pain',
    emoji: '😭',
    label: 'Pain',
    kind: 'contextual-wrong-right',
    description: 'I almost picked that option too!',
  },
  {
    id: 'sniped',
    emoji: '🎯',
    label: 'Sniped',
    kind: 'contextual-wrong-right',
    description: 'Clean snipe on a tough question',
  },
  {
    id: 'big-brain',
    emoji: '🧠',
    label: 'Big brain',
    kind: 'contextual-wrong-right',
    description: 'Galaxy brain move right there',
  },
];

export const CONTEXTUAL_TWIN_RIGHT_REACTIONS: ContextualReactionPreset[] = [
  {
    id: 'twin-brain',
    emoji: '🤝',
    label: 'Twin brain!',
    kind: 'contextual-both-right',
    description: 'Great minds think alike!',
  },
  {
    id: 'too-easy',
    emoji: '🔥',
    label: 'We cooked',
    kind: 'contextual-both-right',
    description: 'We both crushed that question!',
  },
  {
    id: 'speed',
    emoji: '⚡',
    label: 'Locked in',
    kind: 'contextual-both-right',
    description: 'Unstoppable streak!',
  },
];
