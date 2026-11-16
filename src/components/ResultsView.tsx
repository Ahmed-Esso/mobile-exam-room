'use client';

import { useEffect, useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Award,
  Check,
  ChevronDown,
  Clock,
  Crown,
  FileDown,
  Flame,
  Home,
  Loader2,
  RotateCcw,
  Share2,
  Sparkles,
  Target,
  Trophy,
  X,
} from 'lucide-react';
import type { Member, MemberAnswerTag, UseRoomReturn } from '@/types/exam';
import { playPodiumSound } from '@/lib/sound-fx';
import { Avatar, LETTERS, Markdown, MemberTag, copyText, formatSeconds, haptic } from './ui';
import ReactionDock from './ReactionDock';

export default function ResultsView({ api }: { api: UseRoomReturn }) {
  const { room, me, leaderboard } = api;
  const [filter, setFilter] = useState<'all' | 'missed'>('all');
  const [openQuestions, setOpenQuestions] = useState<Record<number, boolean>>({ 0: true });
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [exportingMode, setExportingMode] = useState<'missed' | 'all' | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  // Fire celebration confetti + podium fanfare when podium mounts
  useEffect(() => {
    haptic([15, 50, 20, 50, 30]);
    playPodiumSound();
    try {
      void confetti({
        particleCount: 65,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#d7ff3f', '#9aa6ff', '#ffb02e', '#ff7ac6'],
      });
    } catch {
      /* ignore confetti errors in headless/SSR environments */
    }
  }, []);

  const myRank = useMemo(() => {
    if (!me) return 1;
    const idx = leaderboard.findIndex((m) => m.id === me.id);
    return idx >= 0 ? idx + 1 : 1;
  }, [leaderboard, me]);

  if (!room) return null;

  const totalQ = Math.max(1, room.questions.length);
  const myAccuracy = me ? Math.round((me.correctCount / totalQ) * 100) : 0;
  const myAnsweredCount = me ? Object.keys(me.answers).length : 0;
  const myAvgTimeMs =
    me && myAnsweredCount > 0 ? Math.round(me.totalTimeMs / myAnsweredCount) : 0;

  const first = leaderboard[0];
  const second = leaderboard[1];
  const third = leaderboard[2];

  const toggleQuestion = (qIdx: number) => {
    haptic(5);
    setOpenQuestions((prev) => ({ ...prev, [qIdx]: !prev[qIdx] }));
  };

  const expandAll = () => {
    haptic(6);
    const next: Record<number, boolean> = {};
    room.questions.forEach((_, idx) => {
      next[idx] = true;
    });
    setOpenQuestions(next);
  };

  const shareResults = async () => {
    const lines = [
      `🏆 ${room.title} — Room ${room.code}`,
      ...leaderboard.slice(0, 5).map((m, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
        return `${medal} ${m.avatar} ${m.name}: ${m.score.toLocaleString()} pts (${m.correctCount}/${totalQ})`;
      }),
    ];
    if (await copyText(lines.join('\n'))) {
      haptic([8, 40, 8]);
      setCopiedSummary(true);
      window.setTimeout(() => setCopiedSummary(false), 1800);
    }
  };

  const buildOptionTagsForQuestion = (qIdx: number, optIdx: number): MemberAnswerTag[] => {
    return room.members
      .filter((m) => m.answers[qIdx]?.optionIndex === optIdx)
      .sort((a, b) => (a.answers[qIdx]?.answeredAt ?? 0) - (b.answers[qIdx]?.answeredAt ?? 0))
      .map((m, orderIdx) => {
        const ans = m.answers[qIdx]!;
        return {
          memberId: m.id,
          name: m.name,
          avatar: m.avatar,
          isMe: m.id === me?.id,
          optionIndex: optIdx,
          isCorrect: ans.isCorrect,
          timeMs: ans.timeMs,
          pointsEarned: ans.pointsEarned,
          order: orderIdx + 1,
        };
      });
  };

  const missedCount = room.questions.filter(
    (_, qIdx) => !me?.answers[qIdx] || !me.answers[qIdx].isCorrect
  ).length;

  const handleExportPdf = async (mode: 'missed' | 'all') => {
    if (!me || exportingMode) return;
    haptic(8);
    setExportingMode(mode);
    setExportStatus(null);
    try {
      const { exportQuestionsPdf } = await import('@/lib/export-pdf');
      const res = await exportQuestionsPdf({
        title: room.title,
        roomCode: room.code,
        playerName: me.name,
        score: me.score,
        correctCount: me.correctCount,
        totalCount: room.questions.length,
        questions: room.questions,
        answers: me.answers,
        mode,
      });
      setExportStatus(`Saved ${res.exportedCount} questions (${res.filename})`);
    } catch (err) {
      setExportStatus(
        err instanceof Error ? err.message : 'Could not export PDF on this browser.'
      );
    } finally {
      setExportingMode(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scroll-area">
        <div className="pt-safe px-5 pb-8">
          {/* Top Bar */}
          <header className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => {
                haptic(6);
                void api.resetRoom(true);
              }}
              className="chip"
            >
              <Home size={15} /> Lobby
            </button>

            <span className="code-cell rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-bold text-[var(--muted)] shadow-[0_0_0_1px_var(--line)]">
              ROOM {room.code}
            </span>

            <button
              type="button"
              onClick={() => void shareResults()}
              className="chip"
              data-active={copiedSummary}
            >
              {copiedSummary ? <Check size={15} /> : <Share2 size={15} />}
              {copiedSummary ? 'Copied' : 'Share'}
            </button>
          </header>

          {/* Headline */}
          <section className="rise mt-5 text-center">
            <div className="mx-auto inline-flex items-center gap-1.5 rounded-full bg-[rgba(215,255,63,0.14)] px-3 py-1 text-xs font-bold text-[var(--lime)]">
              <Trophy size={13} /> Final Podium · {room.questions.length} Questions
            </div>
            <h1 className="mt-2 font-display text-[30px] font-extrabold leading-tight tracking-tight [text-wrap:balance]">
              {first
                ? `${first.avatar} ${first.id === me?.id ? 'You' : first.name} takes the crown!`
                : 'Exam Complete!'}
            </h1>
            <p className="mt-1 text-xs text-[var(--muted)]">{room.title}</p>
          </section>

          {/* Animated 2nd / 1st / 3rd Podium */}
          <section
            aria-label="Top 3 Podium"
            className="mt-6 grid grid-cols-3 items-end gap-2.5 px-1 pt-4"
          >
            {/* 2nd Place */}
            <PodiumColumn
              member={second}
              place={2}
              isMe={second?.id === me?.id}
              totalQuestions={totalQ}
              barHeight="h-24"
              delay="120ms"
            />
            {/* 1st Place */}
            <PodiumColumn
              member={first}
              place={1}
              isMe={first?.id === me?.id}
              totalQuestions={totalQ}
              barHeight="h-32"
              delay="0ms"
            />
            {/* 3rd Place */}
            <PodiumColumn
              member={third}
              place={3}
              isMe={third?.id === me?.id}
              totalQuestions={totalQ}
              barHeight="h-20"
              delay="240ms"
            />
          </section>

          {/* Personal Performance Stats Card */}
          {me ? (
            <section className="panel rise mt-5 p-4" style={{ animationDelay: '120ms' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Avatar emoji={me.avatar} size={42} ring="me" />
                  <div>
                    <h2 className="font-display text-base font-bold">
                      Your Performance · #{myRank}
                    </h2>
                    <p className="text-xs text-[var(--muted)] tabular">
                      {me.score.toLocaleString()} total points
                    </p>
                  </div>
                </div>
                <span
                  className="code-cell rounded-xl px-2.5 py-1 text-xs font-extrabold tabular"
                  style={{
                    background: myAccuracy >= 70 ? 'var(--lime)' : 'var(--surface-3)',
                    color: myAccuracy >= 70 ? 'var(--ink)' : 'var(--paper)',
                  }}
                >
                  {myAccuracy}% accuracy
                </span>
              </div>

              <div className="mt-3.5 grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-[var(--ink-2)] p-2.5 text-center shadow-[0_0_0_1px_var(--line)]">
                  <p className="flex items-center justify-center gap-1 text-[11px] font-semibold text-[var(--muted)]">
                    <Target size={12} className="text-[var(--lime)]" /> Correct
                  </p>
                  <p className="code-cell mt-1 text-lg font-extrabold tabular">
                    {me.correctCount}
                    <span className="text-xs text-[var(--faint)]">/{totalQ}</span>
                  </p>
                </div>

                <div className="rounded-2xl bg-[var(--ink-2)] p-2.5 text-center shadow-[0_0_0_1px_var(--line)]">
                  <p className="flex items-center justify-center gap-1 text-[11px] font-semibold text-[var(--muted)]">
                    <Flame size={12} className="text-[var(--amber)]" /> Best Streak
                  </p>
                  <p className="code-cell mt-1 text-lg font-extrabold tabular">
                    {me.bestStreak}🔥
                  </p>
                </div>

                <div className="rounded-2xl bg-[var(--ink-2)] p-2.5 text-center shadow-[0_0_0_1px_var(--line)]">
                  <p className="flex items-center justify-center gap-1 text-[11px] font-semibold text-[var(--muted)]">
                    <Clock size={12} className="text-[var(--peri)]" /> Avg Speed
                  </p>
                  <p className="code-cell mt-1 text-lg font-extrabold tabular">
                    {myAvgTimeMs > 0 ? formatSeconds(myAvgTimeMs) : '—'}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {/* Full Standings */}
          <section className="panel rise mt-4 p-4" style={{ animationDelay: '180ms' }}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Room Standings</h2>
              <span className="text-xs text-[var(--muted)] tabular">
                {leaderboard.length} {leaderboard.length === 1 ? 'member' : 'members'}
              </span>
            </div>

            <ul className="mt-3 space-y-2">
              {leaderboard.map((m, idx) => {
                const isMe = m.id === me?.id;
                const answered = Math.max(1, Object.keys(m.answers).length);
                const avgMs = Math.round(m.totalTimeMs / answered);
                const acc = Math.round((m.correctCount / totalQ) * 100);
                return (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
                    style={{
                      background: isMe ? 'var(--surface-2)' : 'var(--ink-2)',
                      boxShadow: isMe
                        ? '0 0 0 1.5px var(--lime)'
                        : '0 0 0 1px var(--line)',
                    }}
                  >
                    <span
                      className="code-cell flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold tabular"
                      style={{
                        background:
                          idx === 0
                            ? 'var(--lime)'
                            : idx === 1
                            ? 'var(--peri)'
                            : idx === 2
                            ? 'var(--amber)'
                            : 'var(--surface-3)',
                        color: idx < 3 ? 'var(--ink)' : 'var(--muted)',
                      }}
                    >
                      #{idx + 1}
                    </span>

                    <Avatar emoji={m.avatar} size={36} badge={m.statusBadge} />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {isMe ? `${m.name} (You)` : m.name}
                      </p>
                      <p className="text-[11px] text-[var(--muted)] tabular">
                        {m.correctCount}/{totalQ} ({acc}%) · avg {formatSeconds(avgMs)}
                        {m.bestStreak >= 2 ? ` · 🔥${m.bestStreak}` : ''}
                      </p>
                    </div>

                    <span className="code-cell text-sm font-extrabold text-[var(--paper)] tabular">
                      {m.score.toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Rematch / Back to Lobby CTA Row */}
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                haptic([10, 30, 10]);
                void api.resetRoom(false);
              }}
              className="btn-primary h-13 text-sm"
            >
              <RotateCcw size={17} /> Rematch Now
            </button>
            <button
              type="button"
              onClick={() => {
                haptic(8);
                void api.resetRoom(true);
              }}
              className="btn-secondary h-13 text-sm"
            >
              <Award size={17} /> Change Pack / Mode
            </button>
          </div>

          {/* Full Question-by-Question Answer & Explanation Review */}
          <section className="rise mt-7" style={{ animationDelay: '220ms' }}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div>
                <h2 className="font-display text-lg font-bold">Question & Explanation Review</h2>
                <p className="text-xs text-[var(--muted)]">
                  Every option, who picked what, and why the answer is right
                </p>
              </div>
              <button
                type="button"
                onClick={expandAll}
                className="text-xs font-semibold text-[var(--lime)] underline underline-offset-2"
              >
                Expand all
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={exportingMode !== null || missedCount === 0}
                onClick={() => void handleExportPdf('missed')}
                className="btn-primary !min-h-[38px] !rounded-xl !px-3 text-xs"
              >
                {exportingMode === 'missed' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <FileDown size={14} />
                )}
                {missedCount === 0
                  ? 'No Missed Questions!'
                  : `Missed Questions PDF (${missedCount})`}
              </button>
              <button
                type="button"
                disabled={exportingMode !== null}
                onClick={() => void handleExportPdf('all')}
                className="btn-secondary !min-h-[38px] !rounded-xl !px-3 text-xs"
              >
                {exportingMode === 'all' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <FileDown size={14} />
                )}
                All PDF
              </button>
            </div>

            {exportStatus ? (
              <p className="mt-2 px-1 text-xs font-medium text-[var(--lime)]" role="status">
                {exportStatus}
              </p>
            ) : null}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="chip text-xs"
                data-active={filter === 'all'}
                onClick={() => setFilter('all')}
              >
                All Questions ({room.questions.length})
              </button>
              <button
                type="button"
                className="chip text-xs"
                data-active={filter === 'missed'}
                onClick={() => setFilter('missed')}
              >
                Missed by Me (
                {
                  room.questions.filter(
                    (_, qIdx) => !me?.answers[qIdx] || !me.answers[qIdx].isCorrect
                  ).length
                }
                )
              </button>
            </div>

            <div className="mt-3 space-y-3">
              {room.questions.map((q, qIdx) => {
                const myAns = me?.answers[qIdx];
                const iGotItRight = myAns?.isCorrect === true;
                if (filter === 'missed' && iGotItRight) return null;

                const isOpen = !!openQuestions[qIdx];

                return (
                  <article
                    key={q.id || qIdx}
                    className="panel review-item overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleQuestion(qIdx)}
                      aria-expanded={isOpen}
                      className="flex w-full items-start gap-3 p-4 text-left"
                    >
                      <span
                        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold"
                        style={{
                          background: iGotItRight
                            ? 'rgba(215, 255, 63, 0.18)'
                            : 'rgba(255, 106, 85, 0.18)',
                          color: iGotItRight ? 'var(--lime)' : 'var(--coral)',
                        }}
                      >
                        {iGotItRight ? <Check size={15} strokeWidth={3} /> : <X size={15} strokeWidth={3} />}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                          <span className="code-cell font-bold text-[var(--paper)]">
                            Q{qIdx + 1}
                          </span>
                          {q.category ? <span>· {q.category}</span> : null}
                          {myAns ? (
                            <span className="tabular">· {formatSeconds(myAns.timeMs)}</span>
                          ) : (
                            <span>· Unanswered</span>
                          )}
                        </div>
                        <h3 className="mt-1 font-display text-[16px] font-bold leading-snug text-[var(--paper)]">
                          <Markdown source={q.prompt} inline />
                        </h3>
                      </div>

                      <ChevronDown
                        size={18}
                        className={`mt-1 shrink-0 text-[var(--muted)] transition-transform duration-300 ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    <div className="expander" data-open={isOpen}>
                      <div>
                        <div className="space-y-2.5 border-t border-[var(--line)] px-4 pb-4 pt-3">
                          {q.codeSnippet ? (
                            <pre
                              dir="ltr"
                              className="code-cell overflow-x-auto rounded-2xl bg-[var(--ink)] p-3 text-xs leading-relaxed"
                            >
                              <code>{q.codeSnippet}</code>
                            </pre>
                          ) : null}

                          <div className="space-y-2">
                            {q.options.map((opt, optIdx) => {
                              const isCorrect = optIdx === q.correctIndex;
                              const isMyPick = myAns?.optionIndex === optIdx;
                              const tags = buildOptionTagsForQuestion(qIdx, optIdx);
                              const perOptionExpl = q.optionExplanations?.[optIdx];
                              const showFallbackHere =
                                (!q.optionExplanations || !q.optionExplanations.some((e) => e && e.trim())) &&
                                isCorrect &&
                                Boolean(q.explanation);

                              return (
                                <div
                                  key={optIdx}
                                  className="rounded-2xl p-3"
                                  style={{
                                    background: isCorrect
                                      ? 'rgba(215, 255, 63, 0.1)'
                                      : isMyPick
                                      ? 'rgba(255, 106, 85, 0.1)'
                                      : 'var(--ink-2)',
                                    boxShadow: isCorrect
                                      ? '0 0 0 1.5px var(--lime)'
                                      : isMyPick
                                      ? '0 0 0 1.5px var(--coral)'
                                      : '0 0 0 1px var(--line)',
                                  }}
                                >
                                  <div className="flex items-start gap-2.5">
                                    <span
                                      className="code-cell mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                                      style={{
                                        background: isCorrect
                                          ? 'var(--lime)'
                                          : isMyPick
                                          ? 'var(--coral)'
                                          : 'var(--surface-3)',
                                        color:
                                          isCorrect || isMyPick
                                            ? 'var(--ink)'
                                            : 'var(--paper)',
                                      }}
                                    >
                                      {LETTERS[optIdx]}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium leading-snug text-[var(--paper)]">
                                        <Markdown source={opt} inline />
                                      </p>
                                      {tags.length > 0 ? (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                          {tags.map((t) => (
                                            <MemberTag key={t.memberId} tag={t} showResult />
                                          ))}
                                        </div>
                                      ) : null}
                                      {perOptionExpl || showFallbackHere ? (
                                        <div className="mt-1.5 border-t border-white/10 pt-1.5 text-xs leading-snug text-[var(--paper)]/85">
                                          <Markdown source={perOptionExpl || q.explanation} />
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {q.optionExplanations?.some((e) => e && e.trim()) && q.explanation ? (
                            <div className="rounded-2xl bg-[var(--ink-2)] p-3.5 shadow-[0_0_0_1px_var(--line)]">
                              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--lime)]">
                                <Sparkles size={13} /> Key Takeaway
                              </p>
                              <div className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
                                <Markdown source={q.explanation} />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {/* Keep Reaction Dock live on Podium so players can celebrate */}
      <ReactionDock api={api} />
    </div>
  );
}

function PodiumColumn({
  member,
  place,
  isMe,
  totalQuestions,
  barHeight,
  delay,
}: {
  member: Member | undefined;
  place: 1 | 2 | 3;
  isMe: boolean;
  totalQuestions: number;
  barHeight: string;
  delay: string;
}) {
  if (!member) {
    return (
      <div className="flex flex-col items-center opacity-30">
        <div className={`w-full rounded-t-3xl bg-[var(--surface)] ${barHeight}`} />
      </div>
    );
  }

  const accent =
    place === 1 ? 'var(--lime)' : place === 2 ? 'var(--peri)' : 'var(--amber)';

  return (
    <div className="flex flex-col items-center">
      <div className="relative mb-2 flex flex-col items-center">
        {place === 1 ? (
          <span className="pop mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--lime)] text-[var(--ink)] shadow">
            <Crown size={14} strokeWidth={2.8} />
          </span>
        ) : null}
        <Avatar
          emoji={member.avatar}
          size={place === 1 ? 58 : 48}
          ring={place === 1 ? 'correct' : isMe ? 'me' : 'none'}
          badge={member.statusBadge}
        />
        <span className="mt-1.5 max-w-[96px] truncate text-xs font-bold">
          {isMe ? 'You' : member.name}
        </span>
        <span className="code-cell text-[11px] font-bold text-[var(--muted)] tabular">
          {member.score.toLocaleString()}
        </span>
      </div>

      <div
        className={`podium-bar flex w-full flex-col items-center justify-between rounded-t-[22px] p-2.5 ${barHeight}`}
        style={{
          animationDelay: delay,
          background:
            place === 1
              ? 'linear-gradient(180deg, rgba(215,255,63,0.26), rgba(26,27,34,0.95))'
              : place === 2
              ? 'linear-gradient(180deg, rgba(154,166,255,0.22), rgba(26,27,34,0.95))'
              : 'linear-gradient(180deg, rgba(255,176,46,0.22), rgba(26,27,34,0.95))',
          boxShadow: `inset 0 2px 0 ${accent}, 0 0 0 1px var(--line)`,
        }}
      >
        <span
          className="font-display text-xl font-extrabold"
          style={{ color: accent }}
        >
          #{place}
        </span>
        <span className="code-cell text-[10px] font-semibold text-[var(--muted)] tabular">
          {member.correctCount}/{totalQuestions} ✓
        </span>
      </div>
    </div>
  );
}
