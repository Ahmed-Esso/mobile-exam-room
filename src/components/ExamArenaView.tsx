'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCheck,
  Clock,
  Flame,
  Hourglass,
  Infinity as InfinityIcon,
  LogOut,
  Trophy,
  UserMinus,
  Users,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import type { ConnectionStatus, UseRoomReturn } from '@/types/exam';
import { Avatar, LETTERS, Markdown, MemberTag, Sheet, formatSeconds, haptic } from './ui';
import MemberStrip from './MemberStrip';
import ContextualReactStrip from './ContextualReactStrip';
import ReactionDock from './ReactionDock';

export default function ExamArenaView({ api }: { api: UseRoomReturn }) {
  const {
    room,
    me,
    isHost,
    currentQuestion,
    myCurrentAnswer,
    isAnswerRevealedToMe,
    optionTags,
    answeredCount,
    totalMembersCount,
    waitingOnMembers,
    leaderboard,
    myReadyForNext,
    nextReadyCount,
    waitingOnNextMembers,
  } = api;

  const [optimisticOption, setOptimisticOption] = useState<number | null>(null);
  const [remainingSec, setRemainingSec] = useState<number>(0);
  const [justBurst, setJustBurst] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [pressedNext, setPressedNext] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [expandedExpl, setExpandedExpl] = useState<Record<number, boolean>>({});
  const prevRevealedRef = useRef<boolean>(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const qIdx = room?.currentQuestionIndex ?? 0;
  const totalQ = room?.questions.length ?? 1;
  const timeLimit = currentQuestion?.timeLimitSeconds || room?.timePerQuestion || 0;
  const timerOn = timeLimit > 0;

  // Reset per-question UI state when the question changes
  useEffect(() => {
    setOptimisticOption(null);
    setJustBurst(false);
    setPressedNext(false);
    setExpandedExpl({});
    prevRevealedRef.current = false;
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [qIdx]);

  // Reveal moment: burst the member tags in + haptic
  useEffect(() => {
    if (isAnswerRevealedToMe && !prevRevealedRef.current) {
      prevRevealedRef.current = true;
      setJustBurst(true);
      if (myCurrentAnswer?.isCorrect) haptic([10, 40, 18]);
      else if (myCurrentAnswer) haptic([30, 50, 30]);
      const t = window.setTimeout(() => setJustBurst(false), 900);
      return () => window.clearTimeout(t);
    }
  }, [isAnswerRevealedToMe, myCurrentAnswer]);

  // Countdown (only when a timer is set)
  const startedAt = room?.questionStartedAt ?? 0;
  const active = room?.status === 'active';
  useEffect(() => {
    if (!active || !timerOn) return;
    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      setRemainingSec(Math.max(0, Math.ceil(timeLimit - elapsed)));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [active, timerOn, startedAt, timeLimit]);

  if (!room || !currentQuestion) return null;

  const chosenOption = myCurrentAnswer ? myCurrentAnswer.optionIndex : optimisticOption;
  const hasLockedIn = myCurrentAnswer !== null || optimisticOption !== null;
  const isLastQuestion = qIdx + 1 >= totalQ;
  const progressPct = Math.round(((qIdx + (isAnswerRevealedToMe ? 1 : 0.35)) / totalQ) * 100);
  const timerLow = timerOn && !isAnswerRevealedToMe && remainingSec <= 7;
  const optionExplanations = currentQuestion.optionExplanations;
  const hasPerOption = !!optionExplanations && optionExplanations.some((e) => e && e.trim());
  const readyForNext = myReadyForNext || pressedNext;

  const handleSelectOption = async (idx: number) => {
    if (hasLockedIn || isAnswerRevealedToMe) return;
    setOptimisticOption(idx);
    haptic(12);
    await api.submitAnswer(idx);
  };

  const pressNext = () => {
    if (readyForNext) return;
    haptic([10, 30, 10]);
    setPressedNext(true);
    void api.nextQuestion();
  };

  const optionExplanation = (idx: number, isCorrectOption: boolean, isMine: boolean): { text: string; pointer?: boolean } | null => {
    if (hasPerOption) {
      const t = optionExplanations?.[idx];
      return t && t.trim() ? { text: t } : null;
    }
    if (isCorrectOption && currentQuestion.explanation) return { text: currentQuestion.explanation };
    if (isMine && !isCorrectOption) {
      return {
        text: `Not this one. The answer is **${LETTERS[currentQuestion.correctIndex]}**, and the reason is under that option.`,
        pointer: true,
      };
    }
    return null;
  };

  /* --------------------------- bottom action slot --------------------------- */
  let actionSlot: React.ReactNode;
  if (isAnswerRevealedToMe) {
    actionSlot = readyForNext ? (
      <div className="flex h-12 items-center gap-2 rounded-2xl bg-[var(--surface)] px-3.5 shadow-[0_0_0_1.5px_var(--lime)]" role="status">
        <CheckCheck size={18} className="shrink-0 text-[var(--lime)]" />
        <span className="min-w-0 leading-tight">
          <span className="block text-[13px] font-bold tabular">
            Ready for {isLastQuestion ? 'podium' : 'next'} ({Math.max(nextReadyCount, 1)}/{totalMembersCount})
          </span>
          <span className="block truncate text-[11px] text-[var(--muted)]">
            {waitingOnNextMembers.length > 0
              ? `Waiting for ${waitingOnNextMembers.map((m) => m.name).join(', ')}…`
              : 'Moving on…'}
          </span>
        </span>
      </div>
    ) : (
      <button type="button" onClick={pressNext} className="btn-primary h-12 w-full text-[15px]">
        {isLastQuestion ? (
          <>
            <Trophy size={18} /> See the podium
          </>
        ) : (
          <>
            Next question <ArrowRight size={18} />
          </>
        )}
        {totalMembersCount > 1 && nextReadyCount > 0 ? (
          <span className="rounded-full bg-black/15 px-1.5 text-xs tabular">
            {nextReadyCount}/{totalMembersCount}
          </span>
        ) : null}
      </button>
    );
  } else if (hasLockedIn) {
    actionSlot = (
      <div className="flex h-12 items-center gap-2 rounded-2xl bg-[var(--surface)] px-3.5 shadow-[0_0_0_1px_var(--line)]" role="status">
        <Hourglass size={16} className="shrink-0 animate-spin text-[var(--peri)]" style={{ animationDuration: '4s' }} />
        <span className="min-w-0 leading-tight">
          <span className="block text-[13px] font-bold tabular">
            Locked in · {answeredCount}/{totalMembersCount}
          </span>
          <span className="block truncate text-[11px] text-[var(--muted)]">
            {waitingOnMembers.length > 0 ? `Waiting for ${waitingOnMembers.map((m) => m.name).join(', ')}` : 'Revealing…'}
          </span>
        </span>
      </div>
    );
  } else {
    actionSlot = (
      <p className="px-1 text-[12px] leading-snug text-[var(--muted)]">
        {room.mode === 'race'
          ? 'Tap an answer. Reveals together when all lock in — fastest gets the bonus.'
          : 'Tap an answer to lock it in. Nothing reveals until everyone has answered.'}
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* HUD */}
      <header className="pt-safe relative z-20 border-b border-[var(--line)] bg-[rgba(14,15,19,0.88)] px-4 pb-1.5 backdrop-blur-md">
        {api.isLocalOffline || api.syncPendingCount > 0 ? (
          <div
            className="mb-1.5 flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-1 text-[11px] font-semibold"
            style={{
              background: api.isLocalOffline
                ? 'rgba(255, 106, 85, 0.16)'
                : 'rgba(255, 176, 46, 0.16)',
              color: api.isLocalOffline ? 'var(--coral)' : 'var(--amber)',
            }}
            role="status"
          >
            <WifiOff size={12} />
            {api.isLocalOffline
              ? 'Offline — answers queued, reconnecting…'
              : `Syncing (${api.syncPendingCount})…`}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                haptic(6);
                if (!confirmLeave) {
                  setConfirmLeave(true);
                  window.setTimeout(() => setConfirmLeave(false), 2500);
                  return;
                }
                if (isHost) void api.resetRoom(true);
                else api.leaveRoom();
              }}
              className="press flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-2.5 text-[11px] font-semibold shadow-[0_0_0_1px_var(--line)]"
              style={{ color: confirmLeave ? 'var(--coral)' : 'var(--muted)' }}
              aria-label={isHost ? 'End exam and return to lobby' : 'Leave room'}
            >
              <LogOut size={13} />
              {confirmLeave ? (isHost ? 'Tap to end' : 'Tap to leave') : null}
            </button>

            <span
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide"
              style={{
                background: room.mode === 'race' ? 'rgba(255, 176, 46, 0.16)' : 'rgba(154, 166, 255, 0.16)',
                color: room.mode === 'race' ? 'var(--amber)' : 'var(--peri)',
              }}
            >
              {room.mode === 'race' ? <Zap size={12} fill="currentColor" /> : <Users size={12} />}
              {room.mode === 'race' ? 'RACE MODE' : 'WAIT FOR ALL'}
            </span>

            <span className="code-cell truncate rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--muted)]">
              {room.code}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                haptic(5);
                setPlayersOpen(true);
              }}
              aria-label="View room players"
              className="press flex h-8 shrink-0 items-center gap-1 rounded-full bg-[var(--surface-2)] px-2.5 text-[11px] font-semibold text-[var(--paper)] shadow-[0_0_0_1px_var(--line)]"
            >
              <Users size={12} />
              <span className="tabular">{room.members.length}</span>
            </button>

            {timerOn ? (
            <div
              className="code-cell flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold tabular"
              style={{
                background: timerLow ? 'rgba(255, 106, 85, 0.2)' : 'var(--surface-2)',
                color: timerLow ? 'var(--coral)' : 'var(--paper)',
                boxShadow: timerLow ? '0 0 0 1px var(--coral)' : '0 0 0 1px var(--line)',
              }}
              aria-label={isAnswerRevealedToMe ? 'Question done' : `${remainingSec} seconds remaining`}
            >
              <Clock size={13} className={timerLow ? 'animate-pulse' : 'text-[var(--muted)]'} />
              <span>{isAnswerRevealedToMe ? 'Done' : `${remainingSec}s`}</span>
            </div>
            ) : (
              <div
                className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-[var(--surface-2)] px-2.5 text-[11px] font-semibold text-[var(--muted)] shadow-[0_0_0_1px_var(--line)]"
                aria-label="No timer"
              >
                <InfinityIcon size={14} /> No timer
              </div>
            )}
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-2.5">
          <span className="code-cell text-xs font-bold text-[var(--paper)] tabular">
            Q{qIdx + 1}
            <span className="text-[var(--faint)]">/{totalQ}</span>
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%`, background: room.mode === 'race' ? 'var(--amber)' : 'var(--lime)' }}
            />
          </div>
          <span className="text-[11px] font-semibold text-[var(--muted)] tabular">
            {answeredCount}/{totalMembersCount} in
          </span>
        </div>

        <MemberStrip
          room={room}
          leaderboard={leaderboard}
          meId={me?.id ?? null}
          revealedToMe={isAnswerRevealedToMe}
          memberConnectionStatus={api.memberConnectionStatus}
          onOpenPlayers={() => {
            haptic(5);
            setPlayersOpen(true);
          }}
        />
      </header>

      {/* Arena */}
      <div ref={scrollRef} className="scroll-area">
        <div className="space-y-3 px-4 pb-6 pt-4">
          {/* Question */}
          <article key={currentQuestion.id} className="panel rise p-4">
            {currentQuestion.category || currentQuestion.difficulty || (me && me.streak >= 2) ? (
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {currentQuestion.category ? (
                    <span className="rounded-full bg-[var(--surface-3)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--muted)]">
                      {currentQuestion.category}
                    </span>
                  ) : null}
                  {currentQuestion.difficulty ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                      style={{
                        background:
                          currentQuestion.difficulty === 'hard'
                            ? 'rgba(255,106,85,0.16)'
                            : currentQuestion.difficulty === 'medium'
                            ? 'rgba(255,176,46,0.16)'
                            : 'rgba(215,255,63,0.16)',
                        color:
                          currentQuestion.difficulty === 'hard'
                            ? 'var(--coral)'
                            : currentQuestion.difficulty === 'medium'
                            ? 'var(--amber)'
                            : 'var(--lime)',
                      }}
                    >
                      {currentQuestion.difficulty}
                    </span>
                  ) : null}
                </div>
                {me && me.streak >= 2 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(255,176,46,0.16)] px-2.5 py-0.5 text-xs font-bold text-[var(--amber)] tabular">
                    <Flame size={13} fill="currentColor" /> {me.streak} streak
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="font-display text-[20px] font-bold leading-[1.34] text-[var(--paper)]">
              <Markdown source={currentQuestion.prompt} />
            </div>

            {currentQuestion.codeSnippet ? (
              <pre
                dir="ltr"
                className="code-cell mt-3 overflow-x-auto rounded-2xl bg-[var(--ink)] p-3.5 text-[12.5px] leading-relaxed text-[var(--paper)] shadow-[inset_0_2px_4px_rgba(0,0,0,0.45),0_0_0_1px_var(--line)]"
              >
                <code>{currentQuestion.codeSnippet}</code>
              </pre>
            ) : null}
          </article>

          {/* Options + compact member tags + clean inline explanations */}
          <section aria-label="Answer options" className={`space-y-2.5 ${justBurst ? 'burst' : ''}`}>
            {currentQuestion.options.map((optText, idx) => {
              const isSelected = chosenOption === idx;
              const isCorrectOption = idx === currentQuestion.correctIndex;
              const tags = optionTags[idx] || [];

              let state: 'idle' | 'selected' | 'locked' | 'correct' | 'wrong' | 'dim' = 'idle';
              if (isAnswerRevealedToMe) {
                if (isCorrectOption) state = 'correct';
                else if (isSelected) state = 'wrong';
                else state = 'dim';
              } else if (isSelected) {
                state = room.mode === 'wait' ? 'locked' : 'selected';
              }

              const expl = isAnswerRevealedToMe ? optionExplanation(idx, isCorrectOption, isSelected) : null;
              const showExpl = !!expl && (isCorrectOption || isSelected || !!expandedExpl[idx]);
              const canToggleExpl = isAnswerRevealedToMe && !!expl && !isCorrectOption && !isSelected;

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={!canToggleExpl && (hasLockedIn || isAnswerRevealedToMe)}
                  onClick={() => {
                    if (canToggleExpl) {
                      haptic(4);
                      setExpandedExpl((prev) => ({ ...prev, [idx]: !prev[idx] }));
                    } else {
                      void handleSelectOption(idx);
                    }
                  }}
                  data-state={state}
                  className="option p-3.5"
                  style={state === 'dim' && showExpl ? { opacity: 0.84 } : undefined}
                >
                  <div className="flex items-start gap-3">
                    <span className="letter mt-0.5">{LETTERS[idx] ?? idx + 1}</span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[15px] font-semibold leading-snug text-[var(--paper)]">
                          <span className={state === 'correct' ? 'highlight-text' : ''}>
                            <Markdown source={optText} inline />
                          </span>
                        </span>

                        {isAnswerRevealedToMe && isCorrectOption ? (
                          <span className="pop flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--lime)] text-[var(--ink)]">
                            <Check size={14} strokeWidth={3} />
                          </span>
                        ) : isAnswerRevealedToMe && isSelected ? (
                          <span className="pop flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--coral)] text-[var(--ink)]">
                            <X size={14} strokeWidth={3} />
                          </span>
                        ) : !isAnswerRevealedToMe && isSelected ? (
                          <span className="pop shrink-0 rounded-full bg-[var(--peri)] px-2 py-0.5 text-[11px] font-bold text-[var(--ink)]">
                            Locked in ✓
                          </span>
                        ) : null}
                      </div>

                      {tags.length > 0 ? (
                        <div
                          className="mt-2 flex flex-wrap items-center gap-1"
                          aria-label={`Picked by ${tags.map((t) => t.name).join(', ')}`}
                        >
                          {tags.map((tag, tIdx) => (
                            <MemberTag key={tag.memberId} tag={tag} showResult={isAnswerRevealedToMe} delay={tIdx * 55} />
                          ))}
                        </div>
                      ) : null}

                      {showExpl && expl ? (
                        <div className="rise mt-2 border-t border-white/10 pt-1.5 text-[13px] leading-snug text-[var(--paper)]/85">
                          <Markdown source={expl.text} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </section>

          {/* Slim contextual reactions */}
          {isAnswerRevealedToMe ? <ContextualReactStrip api={api} room={room} /> : null}
        </div>
      </div>

      {/* Bottom: main action + collapsible reactions */}
      <ReactionDock api={api} leading={actionSlot} />

      {/* Room Players & Host Kick Sheet */}
      <Sheet open={playersOpen} onClose={() => setPlayersOpen(false)} title="Room players">
        <ul className="space-y-2 pb-3">
          {leaderboard.map((m) => {
            const isMe = m.id === me?.id;
            const ans = m.answers[qIdx];
            const conn: ConnectionStatus =
              api.memberConnectionStatus[m.id] ?? m.connectionStatus ?? 'online';
            const connColor =
              conn === 'offline'
                ? 'var(--coral)'
                : conn === 'weak'
                ? 'var(--amber)'
                : 'var(--lime)';
            const connLabel =
              conn === 'offline' ? 'Offline' : conn === 'weak' ? 'Weak signal' : 'Online';

            return (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2.5 rounded-2xl bg-[var(--surface)] px-3 py-2.5 shadow-[0_0_0_1px_var(--line)]"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar
                    emoji={m.avatar}
                    size={38}
                    host={m.id === room.hostId}
                    badge={m.statusBadge}
                    ring={isMe ? 'me' : 'none'}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {isMe ? `${m.name} (You)` : m.name}
                    </p>
                    <p className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ background: connColor }}
                      />
                      <span style={{ color: connColor }}>{connLabel}</span>
                      <span>·</span>
                      <span>{ans ? 'Locked in ✓' : 'Thinking…'}</span>
                    </p>
                  </div>
                </div>

                {isHost && !isMe ? (
                  <button
                    type="button"
                    onClick={() => {
                      haptic(8);
                      void api.removeMember(m.id);
                    }}
                    className="btn-secondary !min-h-[34px] shrink-0 !rounded-xl !px-2.5 text-xs text-[var(--coral)]"
                  >
                    <UserMinus size={13} /> Remove
                  </button>
                ) : (
                  <span className="code-cell shrink-0 text-xs font-bold text-[var(--muted)] tabular">
                    {m.score.toLocaleString()}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Sheet>
    </div>
  );
}
