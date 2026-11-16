'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCheck,
  Clock,
  Eye,
  Flame,
  Hourglass,
  Infinity as InfinityIcon,
  LogOut,
  Sparkles,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react';
import type { UseRoomReturn } from '@/types/exam';
import { LETTERS, Markdown, MemberTag, formatSeconds, haptic } from './ui';
import AnimalAvatarArt from './AnimalAvatarArt';
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

  const breakdown = useMemo(() => {
    if (!room || !currentQuestion) return { right: [], wrong: [] };
    const right = room.members
      .filter((m) => m.answers[qIdx]?.isCorrect === true)
      .sort((a, b) => (a.answers[qIdx]?.timeMs ?? 0) - (b.answers[qIdx]?.timeMs ?? 0));
    const wrong = room.members.filter((m) => m.answers[qIdx] !== undefined && m.answers[qIdx]?.isCorrect === false);
    return { right, wrong };
  }, [room, currentQuestion, qIdx]);

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
          ? 'Tap an answer. First right answer gets the biggest bonus.'
          : 'Tap an answer to lock it in. Nothing reveals until everyone has answered.'}
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* HUD */}
      <header className="pt-safe relative z-20 border-b border-[var(--line)] bg-[rgba(14,15,19,0.88)] px-4 pb-1.5 backdrop-blur-md">
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

        <MemberStrip room={room} leaderboard={leaderboard} meId={me?.id ?? null} revealedToMe={isAnswerRevealedToMe} />
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

          {/* Options + member tags + inline (NotebookLM-style) explanations */}
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

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={hasLockedIn || isAnswerRevealedToMe}
                  onClick={() => void handleSelectOption(idx)}
                  data-state={state}
                  className="option p-3.5"
                  style={state === 'dim' && expl ? { opacity: 0.78 } : undefined}
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
                          className="mt-2.5 flex flex-wrap items-center gap-1.5"
                          aria-label={`Picked by ${tags.map((t) => t.name).join(', ')}`}
                        >
                          {tags.map((tag, tIdx) => (
                            <MemberTag key={tag.memberId} tag={tag} showResult={isAnswerRevealedToMe} delay={tIdx * 55} />
                          ))}
                        </div>
                      ) : null}

                      {expl ? (
                        <div
                          className="rise mt-2.5 rounded-xl px-3 py-2 text-xs leading-relaxed text-[var(--muted)]"
                          style={{
                            background: 'rgba(0,0,0,0.28)',
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.35)',
                            animationDelay: '240ms',
                          }}
                        >
                          <span
                            className="mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                            style={{
                              color: isCorrectOption ? 'var(--lime)' : isSelected ? 'var(--coral)' : 'var(--faint)',
                            }}
                          >
                            <Sparkles size={11} />
                            {isCorrectOption ? 'Why it’s right' : expl.pointer ? 'Your pick' : 'Why not'}
                          </span>
                          <Markdown source={expl.text} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </section>

          {/* Race: host can close the round for stragglers */}
          {room.mode === 'race' && !room.isRevealed && isHost && answeredCount > 0 && waitingOnMembers.length > 0 ? (
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-[var(--surface)] px-4 py-2.5 text-xs shadow-[0_0_0_1px_var(--line)]">
              <span className="flex min-w-0 items-center gap-2 text-[var(--muted)]">
                <Zap size={14} className="shrink-0 text-[var(--amber)]" />
                <span className="truncate">Still racing: {waitingOnMembers.map((m) => `${m.avatar} ${m.name}`).join(', ')}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  haptic(8);
                  void api.revealQuestion();
                }}
                className="press flex shrink-0 items-center gap-1 font-semibold text-[var(--amber)]"
              >
                <Eye size={13} /> Close round
              </button>
            </div>
          ) : null}

          {/* Slim contextual reactions */}
          {isAnswerRevealedToMe ? <ContextualReactStrip api={api} room={room} /> : null}

          {/* Round summary: outcome, takeaway, who got it */}
          <div className="expander" data-open={isAnswerRevealedToMe}>
            <div>
              <section className="panel p-3.5">
                {myCurrentAnswer ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                        style={{ background: myCurrentAnswer.isCorrect ? 'var(--lime)' : 'var(--coral)', color: 'var(--ink)' }}
                      >
                        {myCurrentAnswer.isCorrect ? <Check size={17} strokeWidth={3} /> : <X size={17} strokeWidth={3} />}
                      </span>
                      <div>
                        <p className="font-display text-sm font-bold">
                          {myCurrentAnswer.isCorrect ? 'Spot on' : `The answer was ${LETTERS[currentQuestion.correctIndex]}`}
                        </p>
                        <p className="text-xs text-[var(--muted)] tabular">
                          {formatSeconds(myCurrentAnswer.timeMs)}
                          {myCurrentAnswer.speedBonus > 0 ? ` · +${myCurrentAnswer.speedBonus} bonus` : ''}
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

                {hasPerOption && currentQuestion.explanation ? (
                  <div className="mt-3 rounded-xl bg-[var(--ink-2)] px-3 py-2 text-xs leading-relaxed text-[var(--muted)] shadow-[0_0_0_1px_var(--line)]">
                    <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-[var(--lime)]">Key takeaway</span>
                    <Markdown source={currentQuestion.explanation} />
                  </div>
                ) : null}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-[var(--ink-2)] p-2.5 shadow-[0_0_0_1px_var(--line)]">
                    <p className="text-[11px] font-bold text-[var(--lime)]">Got it ({breakdown.right.length})</p>
                    {breakdown.right.length > 0 ? (
                      <ul className="mt-1.5 space-y-1">
                        {breakdown.right.map((m, i) => (
                          <li key={m.id} className="flex items-center justify-between gap-1 text-xs">
                            <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                              <AnimalAvatarArt emoji={m.avatar} size={16} />
                              <span className="truncate">{m.id === me?.id ? 'You' : m.name}</span>
                              {i === 0 && room.mode === 'race' ? (
                                <span className="rounded bg-[var(--amber)] px-1 text-[9px] font-extrabold text-[var(--ink)]">1ST</span>
                              ) : null}
                            </span>
                            <span className="code-cell shrink-0 text-[11px] text-[var(--lime)] tabular">
                              +{m.answers[qIdx]?.pointsEarned ?? 0}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-[var(--faint)]">Nobody this time</p>
                    )}
                  </div>
                  <div className="rounded-xl bg-[var(--ink-2)] p-2.5 shadow-[0_0_0_1px_var(--line)]">
                    <p className="text-[11px] font-bold text-[var(--coral)]">Missed ({breakdown.wrong.length})</p>
                    {breakdown.wrong.length > 0 ? (
                      <ul className="mt-1.5 space-y-1">
                        {breakdown.wrong.map((m) => (
                          <li key={m.id} className="flex items-center justify-between gap-1 text-xs">
                            <span className="flex min-w-0 items-center gap-1.5 font-medium text-[var(--muted)]">
                              <AnimalAvatarArt emoji={m.avatar} size={16} />
                              <span className="truncate">{m.id === me?.id ? 'You' : m.name}</span>
                            </span>
                            <span className="code-cell shrink-0 rounded bg-[var(--surface-3)] px-1.5 text-[10px] font-bold text-[var(--muted)]">
                              {LETTERS[m.answers[qIdx]?.optionIndex ?? 0]}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-[var(--faint)]">Clean sweep</p>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: main action + collapsible reactions */}
      <ReactionDock api={api} leading={actionSlot} />
    </div>
  );
}
