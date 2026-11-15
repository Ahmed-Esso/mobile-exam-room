'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Clock,
  Eye,
  Flame,
  Hourglass,
  LogOut,
  Sparkles,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react';
import type { UseRoomReturn } from '@/types/exam';
import { LETTERS, Markdown, MemberTag, formatSeconds, haptic } from './ui';
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
  } = api;

  const [optimisticOption, setOptimisticOption] = useState<number | null>(null);
  const [remainingSec, setRemainingSec] = useState<number>(30);
  const [justBurst, setJustBurst] = useState(false);
  const prevRevealedRef = useRef<boolean>(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const qIdx = room?.currentQuestionIndex ?? 0;
  const totalQ = room?.questions.length ?? 1;
  const timeLimit = currentQuestion?.timeLimitSeconds || room?.timePerQuestion || 30;

  // Reset per-question UI state when question index changes
  useEffect(() => {
    setOptimisticOption(null);
    setJustBurst(false);
    prevRevealedRef.current = false;
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [qIdx]);

  // Detect transition to revealed state for burst animation + haptic feedback
  useEffect(() => {
    if (isAnswerRevealedToMe && !prevRevealedRef.current) {
      prevRevealedRef.current = true;
      setJustBurst(true);
      if (myCurrentAnswer?.isCorrect) {
        haptic([10, 40, 18]);
      } else if (myCurrentAnswer) {
        haptic([30, 50, 30]);
      }
      const t = window.setTimeout(() => setJustBurst(false), 900);
      return () => window.clearTimeout(t);
    }
  }, [isAnswerRevealedToMe, myCurrentAnswer]);

  // Live countdown timer
  useEffect(() => {
    if (!room || room.status !== 'active') return;
    const updateTimer = () => {
      const elapsedSec = (Date.now() - room.questionStartedAt) / 1000;
      const left = Math.max(0, Math.ceil(timeLimit - elapsedSec));
      setRemainingSec(left);
    };
    updateTimer();
    const interval = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(interval);
  }, [room, room?.questionStartedAt, room?.status, timeLimit]);

  const breakdown = useMemo(() => {
    if (!room || !currentQuestion) return { right: [], wrong: [] };
    const right = room.members
      .filter((m) => m.answers[qIdx]?.isCorrect === true)
      .sort((a, b) => (a.answers[qIdx]?.timeMs ?? 0) - (b.answers[qIdx]?.timeMs ?? 0));
    const wrong = room.members.filter(
      (m) => m.answers[qIdx] !== undefined && m.answers[qIdx]?.isCorrect === false
    );
    return { right, wrong };
  }, [room, currentQuestion, qIdx]);

  if (!room || !currentQuestion) return null;

  const chosenOption = myCurrentAnswer ? myCurrentAnswer.optionIndex : optimisticOption;
  const hasLockedIn = myCurrentAnswer !== null || optimisticOption !== null;
  const isLastQuestion = qIdx + 1 >= totalQ;
  const progressPct = Math.round(((qIdx + (isAnswerRevealedToMe ? 1 : 0.35)) / totalQ) * 100);
  const timerLow = !isAnswerRevealedToMe && remainingSec <= 7;

  const handleSelectOption = async (idx: number) => {
    if (hasLockedIn || isAnswerRevealedToMe) return;
    setOptimisticOption(idx);
    haptic(12);
    await api.submitAnswer(idx);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top Sticky HUD */}
      <header className="pt-safe relative z-20 border-b border-[var(--line)] bg-[rgba(14,15,19,0.88)] px-4 pb-2 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                haptic(6);
                if (isHost) void api.resetRoom(true);
                else api.leaveRoom();
              }}
              className="icon-btn !h-8 !w-8"
              aria-label={isHost ? 'Return to lobby' : 'Leave room'}
              title={isHost ? 'Return to lobby' : 'Leave room'}
            >
              <LogOut size={14} />
            </button>

            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide"
              style={{
                background:
                  room.mode === 'race'
                    ? 'rgba(255, 176, 46, 0.16)'
                    : 'rgba(154, 166, 255, 0.16)',
                color: room.mode === 'race' ? 'var(--amber)' : 'var(--peri)',
                boxShadow: '0 0 0 1px var(--line)',
              }}
            >
              {room.mode === 'race' ? <Zap size={12} fill="currentColor" /> : <Users size={12} />}
              {room.mode === 'race' ? 'RACE MODE' : 'WAIT FOR ALL'}
            </span>

            <span className="code-cell rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--muted)]">
              {room.code}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Timer Pill */}
            <div
              className="code-cell flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold tabular"
              style={{
                background: timerLow
                  ? 'rgba(255, 106, 85, 0.2)'
                  : 'var(--surface-2)',
                color: timerLow ? 'var(--coral)' : 'var(--paper)',
                boxShadow: timerLow
                  ? '0 0 0 1px var(--coral)'
                  : '0 0 0 1px var(--line)',
              }}
              aria-label={`${remainingSec} seconds remaining`}
            >
              <Clock size={13} className={timerLow ? 'animate-pulse' : 'text-[var(--muted)]'} />
              <span>{isAnswerRevealedToMe ? 'Done' : `${remainingSec}s`}</span>
            </div>
          </div>
        </div>

        {/* Question Progress Bar */}
        <div className="mt-2.5 flex items-center gap-2.5">
          <span className="code-cell text-xs font-bold text-[var(--paper)] tabular">
            Q{qIdx + 1}
            <span className="text-[var(--faint)]">/{totalQ}</span>
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progressPct}%`,
                background: room.mode === 'race' ? 'var(--amber)' : 'var(--lime)',
              }}
            />
          </div>
          <span className="text-[11px] font-semibold text-[var(--muted)] tabular">
            {answeredCount}/{totalMembersCount} locked
          </span>
        </div>

        {/* Horizontal Scrollable Live Member Strip */}
        <MemberStrip
          room={room}
          leaderboard={leaderboard}
          meId={me?.id ?? null}
          revealedToMe={isAnswerRevealedToMe}
        />
      </header>

      {/* Main Scrollable Arena */}
      <div ref={scrollRef} className="scroll-area">
        <div className="space-y-3.5 px-4 pb-6 pt-4">
          {/* Question Card */}
          <article key={currentQuestion.id} className="panel rise p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
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

            <div className="mt-2.5 font-display text-[20px] font-bold leading-[1.34] text-[var(--paper)]">
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

          {/* Answer Options with Member Answer Tags & LaTeX Rendering */}
          <section
            aria-label="Answer options"
            className={`space-y-2.5 ${justBurst ? 'burst' : ''}`}
          >
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

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={hasLockedIn || isAnswerRevealedToMe}
                  onClick={() => void handleSelectOption(idx)}
                  data-state={state}
                  className="option p-3.5"
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

                        {/* Right-side status icon */}
                        {isAnswerRevealedToMe && isCorrectOption ? (
                          <span className="pop flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--lime)] text-[var(--ink)]">
                            <Check size={14} strokeWidth={3} />
                          </span>
                        ) : isAnswerRevealedToMe && isSelected && !isCorrectOption ? (
                          <span className="pop flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--coral)] text-[var(--ink)]">
                            <X size={14} strokeWidth={3} />
                          </span>
                        ) : !isAnswerRevealedToMe && isSelected ? (
                          <span className="pop shrink-0 rounded-full bg-[var(--peri)] px-2 py-0.5 text-[11px] font-bold text-[var(--ink)]">
                            Locked in ✓
                          </span>
                        ) : null}
                      </div>

                      {/* Member Answer Pill Tags on this option */}
                      {tags.length > 0 ? (
                        <div
                          className="mt-2.5 flex flex-wrap items-center gap-1.5"
                          aria-label={`Selected by ${tags.map((t) => t.name).join(', ')}`}
                        >
                          {tags.map((tag, tIdx) => (
                            <MemberTag
                              key={tag.memberId}
                              tag={tag}
                              showResult={isAnswerRevealedToMe}
                              delay={tIdx * 55}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </section>

          {/* WAIT MODE: Waiting for others banner (after locking in, strictly before reveal) */}
          {room.mode === 'wait' && !isAnswerRevealedToMe && hasLockedIn ? (
            <section className="panel rise p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[rgba(154,166,255,0.16)] text-[var(--peri)]">
                    <Hourglass size={19} className="animate-spin" style={{ animationDuration: '4s' }} />
                  </span>
                  <div>
                    <h2 className="font-display text-base font-bold">
                      Locked In — Waiting for{' '}
                      {waitingOnMembers.length > 0
                        ? waitingOnMembers.map((m) => m.name).join(', ')
                        : 'everyone'}
                    </h2>
                    <p className="text-xs text-[var(--muted)]">
                      {answeredCount} of {totalMembersCount} locked in · Answers &amp; tags reveal together once everyone answers
                    </p>
                  </div>
                </div>
              </div>

              {waitingOnMembers.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
                  <span className="text-xs font-medium text-[var(--muted)]">Still thinking:</span>
                  {waitingOnMembers.map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--paper)] shadow-[0_0_0_1px_var(--line)]"
                    >
                      <span>{m.avatar}</span>
                      <span>{m.name}</span>
                      <span className="thinking-dots text-[var(--muted)]">
                        <span />
                        <span />
                        <span />
                      </span>
                    </span>
                  ))}
                </div>
              ) : null}

              {isHost ? (
                <div className="mt-3 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      haptic(10);
                      void api.revealQuestion();
                    }}
                    className="btn-secondary !min-h-[40px] !px-3.5 text-xs"
                  >
                    <Eye size={15} /> Force Reveal Now
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Host Force Reveal button even before host answers if stuck waiting */}
          {!isAnswerRevealedToMe && !hasLockedIn && isHost && answeredCount > 0 ? (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => {
                  haptic(8);
                  void api.revealQuestion();
                }}
                className="chip text-xs"
              >
                <Eye size={14} /> Force reveal ({answeredCount}/{totalMembersCount} answered)
              </button>
            </div>
          ) : null}

          {/* RACE MODE: When I answered early, show who is still racing */}
          {room.mode === 'race' && isAnswerRevealedToMe && !room.isRevealed && waitingOnMembers.length > 0 ? (
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-[var(--surface)] px-4 py-2.5 text-xs shadow-[0_0_0_1px_var(--line)]">
              <span className="flex items-center gap-2 text-[var(--muted)]">
                <Zap size={14} className="text-[var(--amber)]" />
                Still racing:{' '}
                {waitingOnMembers.map((m) => `${m.avatar} ${m.name}`).join(', ')}
              </span>
              {isHost ? (
                <button
                  type="button"
                  onClick={() => void api.revealQuestion()}
                  className="font-semibold text-[var(--amber)] underline underline-offset-2"
                >
                  Finish round
                </button>
              ) : null}
            </div>
          ) : null}

          {/* Contextual Reaction Strip ("Peer Got It Right & You Missed It!" / "Twin brain!") */}
          {isAnswerRevealedToMe ? (
            <ContextualReactStrip api={api} room={room} />
          ) : null}

          {/* Rich Answer Explanation Card & Score Breakdown */}
          <div className="expander" data-open={isAnswerRevealedToMe}>
            <div>
              <section className="panel mt-1 overflow-hidden p-4">
                {/* Personal Outcome Banner */}
                {myCurrentAnswer ? (
                  <div
                    className="mb-3.5 flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5"
                    style={{
                      background: myCurrentAnswer.isCorrect
                        ? 'rgba(215, 255, 63, 0.12)'
                        : 'rgba(255, 106, 85, 0.12)',
                      boxShadow: myCurrentAnswer.isCorrect
                        ? '0 0 0 1px rgba(215, 255, 63, 0.35)'
                        : '0 0 0 1px rgba(255, 106, 85, 0.35)',
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-bold"
                        style={{
                          background: myCurrentAnswer.isCorrect ? 'var(--lime)' : 'var(--coral)',
                          color: 'var(--ink)',
                        }}
                      >
                        {myCurrentAnswer.isCorrect ? <Check size={17} strokeWidth={3} /> : <X size={17} strokeWidth={3} />}
                      </span>
                      <div>
                        <p className="font-display text-sm font-bold">
                          {myCurrentAnswer.isCorrect ? 'Spot on!' : `Correct answer: ${LETTERS[currentQuestion.correctIndex]}`}
                        </p>
                        <p className="text-xs text-[var(--muted)] tabular">
                          Answered in {formatSeconds(myCurrentAnswer.timeMs)}
                          {myCurrentAnswer.speedBonus > 0
                            ? ` · +${myCurrentAnswer.speedBonus} speed/streak bonus`
                            : ''}
                        </p>
                      </div>
                    </div>

                    <span
                      className="code-cell text-base font-extrabold tabular"
                      style={{ color: myCurrentAnswer.isCorrect ? 'var(--lime)' : 'var(--coral)' }}
                    >
                      +{myCurrentAnswer.pointsEarned}
                    </span>
                  </div>
                ) : null}

                {/* Why it's right (Markdown + LaTeX Explanation) */}
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--lime)]">
                  <Sparkles size={14} />
                  <span>Explanation</span>
                </div>
                <div className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                  <Markdown source={currentQuestion.explanation} />
                </div>

                {/* Breakdown of Who Got It Right vs Wrong */}
                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--line)] pt-3.5">
                  <div className="rounded-2xl bg-[var(--ink-2)] p-2.5 shadow-[0_0_0_1px_var(--line)]">
                    <p className="text-[11px] font-bold text-[var(--lime)]">
                      ✓ Got it right ({breakdown.right.length})
                    </p>
                    {breakdown.right.length > 0 ? (
                      <ul className="mt-2 space-y-1.5">
                        {breakdown.right.map((m, i) => {
                          const ans = m.answers[qIdx];
                          return (
                            <li key={m.id} className="flex items-center justify-between gap-1 text-xs">
                              <span className="flex items-center gap-1.5 truncate font-semibold">
                                <span>{m.avatar}</span>
                                <span className="truncate">{m.id === me?.id ? 'You' : m.name}</span>
                                {i === 0 && room.mode === 'race' ? (
                                  <span className="rounded bg-[var(--amber)] px-1 text-[9px] font-extrabold text-[var(--ink)]">
                                    1ST
                                  </span>
                                ) : null}
                              </span>
                              <span className="code-cell shrink-0 text-[11px] text-[var(--lime)] tabular">
                                +{ans?.pointsEarned ?? 0}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-1.5 text-xs text-[var(--faint)]">Nobody got this one!</p>
                    )}
                  </div>

                  <div className="rounded-2xl bg-[var(--ink-2)] p-2.5 shadow-[0_0_0_1px_var(--line)]">
                    <p className="text-[11px] font-bold text-[var(--coral)]">
                      ✕ Missed ({breakdown.wrong.length})
                    </p>
                    {breakdown.wrong.length > 0 ? (
                      <ul className="mt-2 space-y-1.5">
                        {breakdown.wrong.map((m) => {
                          const ans = m.answers[qIdx];
                          return (
                            <li key={m.id} className="flex items-center justify-between gap-1 text-xs">
                              <span className="flex items-center gap-1.5 truncate font-medium text-[var(--muted)]">
                                <span>{m.avatar}</span>
                                <span className="truncate">{m.id === me?.id ? 'You' : m.name}</span>
                              </span>
                              <span className="code-cell shrink-0 rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--muted)]">
                                Picked {LETTERS[ans?.optionIndex ?? 0]}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-1.5 text-xs text-[var(--faint)]">Clean sweep!</p>
                    )}
                  </div>
                </div>

                {/* Next Question / Podium Action */}
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      haptic([10, 30, 10]);
                      void api.nextQuestion();
                    }}
                    className="btn-primary h-13 w-full text-base"
                  >
                    {isLastQuestion ? (
                      <>
                        <Trophy size={19} /> See Final Podium
                      </>
                    ) : (
                      <>
                        Next Question ({qIdx + 2} of {totalQ}) <ArrowRight size={19} />
                      </>
                    )}
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      {/* Always-accessible Zoom/Teams Floating Reaction Dock */}
      <ReactionDock api={api} />
    </div>
  );
}
