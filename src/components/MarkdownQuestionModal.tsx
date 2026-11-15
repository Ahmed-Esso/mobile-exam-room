'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, FileUp, KeyRound, Loader2, Sparkles, Wand2 } from 'lucide-react';
import type { UseRoomReturn } from '@/types/exam';
import { SAMPLE_EXAM_PACKS } from '@/lib/sample-exams';
import { MARKDOWN_FORMAT_GUIDE, parseMarkdownQuestions } from '@/lib/markdown-parser';
import { LETTERS, Sheet, Toggle, haptic } from './ui';

const KEY_STORAGE = 'exam_room_gemini_key_v1';

export default function MarkdownQuestionModal({
  open,
  onClose,
  api,
}: {
  open: boolean;
  onClose: () => void;
  api: UseRoomReturn;
}) {
  const [markdown, setMarkdown] = useState('');
  const [debounced, setDebounced] = useState('');
  const [title, setTitle] = useState('');
  const [useGemini, setUseGemini] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [expanded, setExpanded] = useState<number | null>(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    try {
      setApiKey(window.localStorage.getItem(KEY_STORAGE) ?? '');
    } catch {
      /* ignore */
    }
  }, [open]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(markdown), 220);
    return () => window.clearTimeout(t);
  }, [markdown]);

  const preview = useMemo(() => {
    if (!debounced.trim()) return null;
    try {
      return parseMarkdownQuestions(debounced);
    } catch {
      return { questions: [], source: 'markdown' as const, warnings: ['The parser could not read this Markdown.'] };
    }
  }, [debounced]);

  const count = preview?.questions.length ?? 0;
  const canSave = markdown.trim().length > 0 && (count > 0 || useGemini);

  const loadTemplate = (md: string, t?: string) => {
    haptic(6);
    setMarkdown(md);
    setDebounced(md);
    if (t) setTitle(t);
    setExpanded(0);
    setResult(null);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    loadTemplate(text, file.name.replace(/\.(md|markdown|txt)$/i, '').replace(/[-_]+/g, ' '));
  };

  const save = async () => {
    setSaving(true);
    setResult(null);
    haptic([10, 30, 10]);
    try {
      if (useGemini) {
        try {
          if (apiKey.trim()) window.localStorage.setItem(KEY_STORAGE, apiKey.trim());
          else window.localStorage.removeItem(KEY_STORAGE);
        } catch {
          /* ignore */
        }
        const res = await api.parseAndSetMarkdown({
          markdown,
          title: title.trim() || undefined,
          useGemini: true,
          apiKey: apiKey.trim() || undefined,
        });
        if (res && res.questions.length) {
          setResult({
            ok: true,
            text: `${res.questions.length} questions loaded${res.source === 'gemini' ? ' with Gemini' : ' with the built-in parser'}.`,
          });
          window.setTimeout(onClose, 900);
        } else {
          setResult({ ok: false, text: 'No questions found. Check the format guide and try again.' });
        }
      } else if (preview && preview.questions.length) {
        await api.setQuestions(preview.questions, title.trim() || undefined);
        setResult({ ok: true, text: `${preview.questions.length} questions loaded.` });
        window.setTimeout(onClose, 700);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      tall
      title="Question studio"
      footer={
        <div className="space-y-2">
          {result ? (
            <p
              className="rise flex items-center gap-2 text-sm font-medium"
              style={{ color: result.ok ? 'var(--lime)' : 'var(--coral)' }}
              role="status"
            >
              {result.ok ? <Check size={16} /> : <AlertTriangle size={16} />}
              {result.text}
            </p>
          ) : null}
          <button type="button" className="btn-primary h-14 w-full text-base" disabled={!canSave || saving} onClick={save}>
            {saving ? <Loader2 size={20} className="animate-spin" /> : useGemini ? <Sparkles size={19} /> : <Check size={19} strokeWidth={2.6} />}
            {saving
              ? useGemini
                ? 'Gemini is reading your notes…'
                : 'Loading…'
              : useGemini
              ? 'Smart parse with Gemini'
              : count
              ? `Use these ${count} questions`
              : 'Paste questions to continue'}
          </button>
        </div>
      }
    >
      {/* Templates */}
      <p className="label">Start from a sample</p>
      <div className="no-scrollbar -mx-5 mt-2 flex gap-2.5 overflow-x-auto px-5 pb-1">
        {SAMPLE_EXAM_PACKS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => loadTemplate(p.markdown, p.title)}
            className="press w-[180px] shrink-0 rounded-2xl bg-[var(--surface)] p-3 text-left shadow-[0_0_0_1px_var(--line)] hover:bg-[var(--surface-2)]"
          >
            <span className="text-xl" aria-hidden>
              {p.icon}
            </span>
            <span className="mt-1.5 line-clamp-2 block text-sm font-semibold leading-snug">{p.title}</span>
            <span className="mt-1 block text-xs text-[var(--muted)] tabular">
              {p.questionCount} Qs · {p.estimatedMinutes} min
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => loadTemplate(MARKDOWN_FORMAT_GUIDE, 'My exam')}
          className="press w-[150px] shrink-0 rounded-2xl border-2 border-dashed border-[var(--line-strong)] p-3 text-left hover:bg-[var(--surface)]"
        >
          <Wand2 size={20} className="text-[var(--lime)]" />
          <span className="mt-1.5 block text-sm font-semibold leading-snug">Format guide</span>
          <span className="mt-1 block text-xs text-[var(--muted)]">A blank template to copy</span>
        </button>
      </div>

      {/* Title */}
      <label htmlFor="studio-title" className="label mt-5 block">
        Exam title
      </label>
      <input
        id="studio-title"
        className="field mt-1.5"
        placeholder="e.g. Biology midterm review"
        value={title}
        maxLength={60}
        onChange={(e) => setTitle(e.target.value)}
      />

      {/* Editor */}
      <div className="mt-5 flex items-center justify-between">
        <label htmlFor="studio-md" className="label">
          Markdown
        </label>
        <button type="button" className="chip h-8 min-h-0 px-3 text-xs" onClick={() => fileRef.current?.click()}>
          <FileUp size={14} /> Upload .md
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      <textarea
        id="studio-md"
        value={markdown}
        onChange={(e) => setMarkdown(e.target.value)}
        spellCheck={false}
        placeholder={'### 1. Your question?\n- A) Option\n- B) Option\n- C) Option\n- D) Option\n**Answer:** B\n**Explanation:** Why B is right.'}
        className="field code-cell mt-1.5 h-52 resize-none py-3 text-[13px] leading-relaxed"
      />

      {/* Gemini */}
      <div className="mt-4 rounded-2xl bg-[var(--surface)] p-4 shadow-[0_0_0_1px_var(--line)]">
        <div className="flex items-center gap-3">
          <Sparkles size={20} className="shrink-0 text-[var(--pink)]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Gemini smart parse</p>
            <p className="text-xs leading-snug text-[var(--muted)]">For messy notes. Gemini turns them into clean questions with explanations.</p>
          </div>
          <Toggle checked={useGemini} onChange={setUseGemini} label="Gemini smart parse" />
        </div>
        <div className="expander" data-open={useGemini}>
          <div>
            <label htmlFor="gemini-key" className="label mt-3 flex items-center gap-1.5">
              <KeyRound size={13} /> Gemini API key (optional)
            </label>
            <input
              id="gemini-key"
              type="password"
              autoComplete="off"
              className="field code-cell mt-1.5 text-sm"
              placeholder="Leave empty to use the server key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="mt-1.5 text-xs text-[var(--faint)]">Kept on this device only. The preview below uses the built-in parser.</p>
          </div>
        </div>
      </div>

      {/* Live preview */}
      <div className="mt-5 flex items-center justify-between">
        <p className="label">Live preview</p>
        {preview ? (
          <span
            key={count}
            className="pop rounded-full px-2.5 py-1 text-xs font-bold tabular"
            style={{
              background: count ? 'var(--lime)' : 'var(--surface-3)',
              color: count ? 'var(--ink)' : 'var(--muted)',
            }}
          >
            {count} {count === 1 ? 'question' : 'questions'}
          </span>
        ) : null}
      </div>

      {!preview ? (
        <p className="mt-2 rounded-2xl bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--muted)] shadow-[0_0_0_1px_var(--line)]">
          Paste Markdown or pick a sample. Parsed questions show up here as you type.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {preview.warnings?.length ? (
            <div className="rounded-2xl bg-[rgba(255,176,46,0.1)] px-4 py-3 text-xs leading-relaxed text-[var(--amber)]">
              {preview.warnings.slice(0, 3).map((w, i) => (
                <p key={i} className="flex gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w}
                </p>
              ))}
            </div>
          ) : null}
          {preview.questions.map((q, i) => {
            const open = expanded === i;
            return (
              <div key={q.id || i} className="overflow-hidden rounded-2xl bg-[var(--surface)] shadow-[0_0_0_1px_var(--line)]">
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-4 py-3 text-left"
                  onClick={() => setExpanded(open ? null : i)}
                  aria-expanded={open}
                >
                  <span className="code-cell mt-0.5 text-xs font-bold text-[var(--muted)] tabular">{String(i + 1).padStart(2, '0')}</span>
                  <span className="line-clamp-2 flex-1 text-sm font-medium leading-snug">{q.prompt}</span>
                  <span className="code-cell mt-0.5 rounded-md bg-[var(--lime)] px-1.5 text-xs font-bold text-[var(--ink)]">
                    {LETTERS[q.correctIndex] ?? '?'}
                  </span>
                </button>
                <div className="expander" data-open={open}>
                  <div>
                    <ul className="space-y-1 px-4 pb-2">
                      {q.options.map((opt, oi) => (
                        <li
                          key={oi}
                          className="flex gap-2 text-[13px]"
                          style={{ color: oi === q.correctIndex ? 'var(--lime)' : 'var(--muted)' }}
                        >
                          <span className="code-cell font-bold">{LETTERS[oi]}</span>
                          <span className="flex-1">{opt}</span>
                          {oi === q.correctIndex ? <Check size={14} className="mt-0.5" /> : null}
                        </li>
                      ))}
                    </ul>
                    {q.explanation ? (
                      <p className="mx-4 mb-3 rounded-xl bg-[var(--ink-2)] px-3 py-2 text-xs leading-relaxed text-[var(--muted)]">
                        {q.explanation}
                      </p>
                    ) : (
                      <p className="mx-4 mb-3 text-xs text-[var(--amber)]">No explanation found for this one.</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
