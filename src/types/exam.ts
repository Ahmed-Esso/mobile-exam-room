export type GameMode = 'wait' | 'race';

export type RoomStatus = 'lobby' | 'active' | 'finished';

export type ConnectionStatus = 'online' | 'weak' | 'offline';

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
  /** NotebookLM-style per-option explanations (index matches options[i]) */
  optionExplanations?: string[];
  category?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  timeLimitSeconds?: number;
}

export interface QuestionAttachment {
  name: string;
  mimeType: string;
  base64Data: string;
  sizeBytes?: number;
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
  username?: string;
  email?: string;
  pictureUrl?: string;
  isHost: boolean;
  /** Mutual Lobby Ready gate */
  isReady?: boolean;
  /** Mutual Next Question gate: questionIndex this member has pressed Next on (-1 if none) */
  readyForNextQuestionIndex?: number;
  connectionStatus?: ConnectionStatus;
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
}

export interface RoomState {
  code: string;
  title: string;
  status: RoomStatus;
  mode: GameMode;
  /** 0 = Timer OFF (Unlimited time). > 0 = seconds per question */
  timePerQuestion: number;
  hostId: string;
  currentQuestionIndex: number;
  questionStartedAt: number;
  examSessionId?: number;
  forceRevealedQuestionIndex?: number;
  questionsUpdatedAt?: number;
  questionsDigest?: string;
  kickedMemberIds?: string[];
  isRevealed: boolean;
  questions: Question[];
  members: Member[];
  reactions: EmojiReaction[];
  version: number;
  createdAt: number;
  updatedAt: number;
}

export type CompactRoomState = Omit<RoomState, 'questions'> & {
  questionCount: number;
  questionsDigest: string;
};

export type RoomDelta =
  | { t: 'ready'; id: string; m: string; r: boolean; ts: number }
  | { t: 'ans'; id: string; m: string; q: number; o: number; ts: number }
  | { t: 'next'; id: string; m: string; q: number; ts: number }
  | { t: 'rx'; id: string; m: string; rx: EmojiReaction; ts: number }
  | { t: 'badge'; id: string; m: string; b: string | null; ts: number }
  | {
      t: 'prof';
      id: string;
      m: string;
      name?: string;
      avatar?: string;
      username?: string;
      ts: number;
    }
  | { t: 'kick'; id: string; target: string; ts: number }
  | { t: 'hb'; m: string; status: ConnectionStatus; ts: number };

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

export interface PublicDirectoryUser {
  username: string;
  name: string;
  avatar: string;
  pictureUrl?: string;
  email?: string;
}

export interface FriendEntry {
  username: string;
  email?: string;
  name: string;
  avatar: string;
  pictureUrl?: string;
  addedAt: number;
}

export interface RoomInvite {
  id: string;
  fromUsername: string;
  fromEmail?: string;
  fromName: string;
  fromAvatar: string;
  roomCode: string;
  roomTitle: string;
  createdAt: number;
}

export interface UserAccount {
  username: string;
  email: string;
  name: string;
  avatar: string;
  pictureUrl?: string;
  googleVerified?: boolean;
  geminiApiKey?: string;
  friends: FriendEntry[];
  invites: RoomInvite[];
  updatedAt: number;
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

  // Weak-internet & Presence helpers
  isLocalOffline: boolean;
  mqttConnected: boolean;
  syncPendingCount: number;
  wasKicked: boolean;
  clearKickedNotice: () => void;
  memberConnectionStatus: Record<string, ConnectionStatus>;
  friendPresence: Record<string, ConnectionStatus>;
  notificationPermission: NotificationPermission | 'unsupported';
  requestNotificationPermission: () => Promise<NotificationPermission | 'unsupported'>;

  // Mutual Ready & Mutual Next Gate helpers
  allMembersReady: boolean;
  readyCount: number;
  myReadyForNext: boolean;
  nextReadyCount: number;
  waitingOnNextMembers: Member[];

  // Derived current question helpers
  currentQuestion: Question | null;
  myCurrentAnswer: MemberAnswer | null;
  isAnswerRevealedToMe: boolean;
  optionTags: Record<number, MemberAnswerTag[]>;
  answeredCount: number;
  totalMembersCount: number;
  waitingOnMembers: Member[];
  peersWhoGotItRightWhenIMissed: Member[];
  peersWhoGotItRightWithMe: Member[];
  leaderboard: Member[];
  activeReactions: EmojiReaction[];

  // Google OAuth Account, @username Friends, Profile & Gemini Key
  account: UserAccount | null;
  googleClientId: string;
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
  updateMemberProfile: (params: {
    name?: string;
    avatar?: string;
    username?: string;
    geminiApiKey?: string;
  }) => Promise<void>;
  saveGoogleClientId: (clientId: string) => Promise<void>;
  loginWithGoogle: (params: {
    email?: string;
    name?: string;
    username?: string;
    avatar?: string;
    pictureUrl?: string;
    googleCredential?: string;
    googleAccessToken?: string;
  }) => Promise<UserAccount | null>;
  logoutAccount: () => void;
  updateUsername: (newUsername: string) => Promise<boolean>;
  searchUsersByUsername: (query: string) => Promise<PublicDirectoryUser[]>;
  addFriendByUsername: (friendUsername: string) => Promise<boolean>;
  removeFriendByUsername: (friendUsername: string) => Promise<void>;
  inviteFriendToRoom: (friendUsername: string) => Promise<boolean>;
  dismissRoomInvite: (inviteId: string) => Promise<void>;
  refreshRoomAndAccount: () => Promise<void>;

  // Room Lifecycle & Actions
  createRoom: (params: {
    name: string;
    avatar: string;
    title?: string;
    mode?: GameMode;
  }) => Promise<RoomState | null>;
  joinRoom: (params: {
    code: string;
    name: string;
    avatar: string;
  }) => Promise<RoomState | null>;
  leaveRoom: () => void;
  toggleReady: (ready?: boolean) => Promise<void>;
  updateSettings: (settings: RoomSettingsUpdate) => Promise<void>;
  setQuestions: (questions: Question[], title?: string) => Promise<void>;
  parseAndSetMarkdown: (params: {
    markdown: string;
    title?: string;
    useGemini?: boolean;
    apiKey?: string;
    attachments?: QuestionAttachment[];
  }) => Promise<ParseQuestionsResult | null>;
  startExam: (modeOverride?: GameMode) => Promise<void>;
  submitAnswer: (optionIndex: number) => Promise<void>;
  revealQuestion: () => Promise<void>;
  nextQuestion: () => Promise<void>;
  resetRoom: (backToLobby?: boolean) => Promise<void>;
  sendReaction: (input: SendReactionInput | string) => Promise<void>;
  setStatusBadge: (badge: string | null) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
}

export const AVATAR_OPTIONS: string[] = [
  '🐥',
  '🦋',
  '🐬',
  '🦉',
  '🐐',
  '🦊',
  '🐼',
  '🦁',
  '🐸',
  '🐱',
  '🐨',
  '🦄',
];

export const ZOOM_REACTIONS: string[] = [
  '🐥',
  '😜',
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

export const EMOJI_LIBRARY: string[] = [
  '🐥',
  '😜',
  '😂',
  '🔥',
  '👏',
  '❤️',
  '🎉',
  '🤔',
  '💀',
  '😭',
  '🫡',
  '🧠',
  '⚡',
  '👀',
  '🤝',
  '😤',
  '🥳',
  '💯',
  '👑',
  '🤯',
  '😎',
  '🫣',
  '🫠',
  '🙌',
];

export const STATUS_BADGES: { emoji: string; label: string }[] = [
  { emoji: '✋', label: 'Raise Hand' },
  { emoji: '🐥', label: 'Chick Vibes' },
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
    id: 'too-easy-tease',
    emoji: '😜',
    label: 'Too easy!',
    kind: 'contextual-both-right',
    description: 'Easy clap, barely broke a sweat!',
  },
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
