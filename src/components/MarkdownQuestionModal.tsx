'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  FileText,
  FileUp,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Lock,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import type { QuestionAttachment, UseRoomReturn } from '@/types/exam';
import {
  AI_PROMPT_FOR_MARKDOWN_QUESTIONS,
  MARKDOWN_FORMAT_GUIDE,
  parseMarkdownQuestions,
} from '@/lib/markdown-parser';
import { LETTERS, Markdown, Sheet, Toggle, copyText, haptic } from './ui';

const KEY_STORAGE = 'exam_room_gemini_key_v1';

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.replace(/^data:[^;]+;base64,/, '');
      resolve(base64);
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

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
  const [attachments, setAttachments] = useState<QuestionAttachment[]>([]);
  const [useGemini, setUseGemini] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [expanded, setExpanded] = useState<number | null>(0);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [promptPreviewOpen, setPromptPreviewOpen] = useState(false);
  const mdFileRef = useRef<HTMLInputElement>(null);
  const mediaFileRef = useRef<HTMLInputElement>(null);

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
      return {
        questions: [],
        source: 'markdown' as const,
        warnings: ['The parser could not read this Markdown.'],
      };
    }
  }, [debounced]);

  const hasApiKey = apiKey.trim().length > 0;
  const count = preview?.questions.length ?? 0;
  const hasAttachments = attachments.length > 0;
  const effectiveUseGemini = (useGemini || hasAttachments) && hasApiKey;
  const canSave =
    (hasAttachments && hasApiKey) ||
    (markdown.trim().length > 0 && (count > 0 || effectiveUseGemini));

  const loadTemplate = (md: string, t?: string) => {
    haptic(6);
    setMarkdown(md);
    setDebounced(md);
    if (t) setTitle(t);
    setExpanded(0);
    setResult(null);
  };

  const handleCopyPrompt = async () => {
    if (await copyText(AI_PROMPT_FOR_MARKDOWN_QUESTIONS)) {
      haptic([8, 35, 8]);
      setCopiedPrompt(true);
      window.setTimeout(() => setCopiedPrompt(false), 1800);
    }
  };

  const handleMarkdownFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setResult(null);
    haptic(8);
    for (const file of Array.from(fileList)) {
      const text = await file.text();
      setMarkdown((prev) => (prev.trim() ? `${prev}\n\n${text}` : text));
      setDebounced((prev) => (prev.trim() ? `${prev}\n\n${text}` : text));
      if (!title.trim()) {
        setTitle(
          file.name
            .replace(/\.(md|markdown|txt)$/i, '')
            .replace(/[-_]+/g, ' ')
        );
      }
    }
  };

  const handleMediaFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !hasApiKey) return;
    setResult(null);
    haptic(8);

    const newAttachments: QuestionAttachment[] = [];
    for (const file of Array.from(fileList)) {
      const lower = file.name.toLowerCase();
      const mimeType =
        file.type ||
        (lower.endsWith('.pdf')
          ? 'application/pdf'
          : lower.endsWith('.png')
          ? 'image/png'
          : lower.endsWith('.webp')
          ? 'image/webp'
          : 'image/jpeg');

      const base64Data = await readFileAsBase64(file);
      newAttachments.push({
        name: file.name,
        mimeType,
        base64Data,
        sizeBytes: file.size,
      });
      if (!title.trim()) {
        setTitle(
          file.name
            .replace(/\.(pdf|png|jpe?g|webp)$/i, '')
            .replace(/[-_]+/g, ' ')
        );
      }
    }

    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments]);
      setUseGemini(true);
    }
  };

  const removeAttachment = (index: number) => {
    haptic(5);
    setAttachments((prev) => prev.filter((_, idx) => idx !== index));
  };

  const save = async () => {
    setSaving(true);
    setResult(null);
    haptic([10, 30, 10]);
    try {
      try {
        if (apiKey.trim()) window.localStorage.setItem(KEY_STORAGE, apiKey.trim());
        else window.localStorage.removeItem(KEY_STORAGE);
      } catch {
        /* ignore */
      }

      if (effectiveUseGemini) {
        const res = await api.parseAndSetMarkdown({
          markdown,
          title: title.trim() || undefined,
          useGemini: true,
          apiKey: apiKey.trim(),
          attachments: attachments.length > 0 ? attachments : undefined,
        });
        if (res && res.questions.length) {
          setResult({
            ok: true,
            text: `${res.questions.length} questions loaded${
              res.source === 'gemini'
                ? ' with Gemini AI (LaTeX & option explanations ready)'
                : ' with the built-in parser'
            }.`,
          });
          window.setTimeout(onClose, 850);
        } else {
          setResult({
            ok: false,
            text: api.error || 'Could not extract questions. Check your Gemini key and try again.',
          });
        }
      } else if (preview && preview.questions.length) {
        await api.setQuestions(preview.questions, title.trim() || undefined);
        setResult({ ok: true, text: `${preview.questions.length} questions loaded.` });
        window.setTimeout(onClose, 650);
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
      title="Question Studio"
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
          <button
            type="button"
            className="btn-primary h-14 w-full text-base"
            disabled={!canSave || saving}
            onClick={save}
          >
            {saving ? (
              <Loader2 size={20} className="animate-spin" />
            ) : effectiveUseGemini ? (
              <Sparkles size={19} />
            ) : (
              <Check size={19} strokeWidth={2.6} />
            )}
            {saving
              ? 'Gemini is extracting questions & LaTeX…'
              : hasAttachments
              ? `Extract Questions from ${attachments.length} ${
                  attachments.length === 1 ? 'File' : 'Files'
                } with Gemini`
              : effectiveUseGemini
              ? 'Smart Parse with Gemini AI'
              : count
              ? `Use these ${count} questions`
              : 'Paste Markdown or unlock PDF / Screenshots'}
          </button>
        </div>
      }
    >
      {/* 1. Gemini API Key Gate + PDF / Screenshot Upload Card */}
      <section className="rounded-2xl bg-[var(--surface)] p-4 shadow-[0_0_0_1px_var(--line)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--paper)]">
              <Sparkles size={16} className="text-[var(--pink)]" />
              PDF &amp; Screenshot AI Extractor
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Enter your Gemini API key first to unlock PDF &amp; screenshot uploads.
            </p>
          </div>
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: hasApiKey ? 'rgba(215, 255, 63, 0.16)' : 'rgba(255, 176, 46, 0.14)',
              color: hasApiKey ? 'var(--lime)' : 'var(--amber)',
            }}
          >
            {hasApiKey ? <Check size={16} /> : <Lock size={15} />}
          </span>
        </div>

        <label htmlFor="gemini-key" className="label mt-3 flex items-center gap-1.5">
          <KeyRound size={13} /> Gemini API Key
        </label>
        <input
          id="gemini-key"
          type="password"
          autoComplete="off"
          className="field code-cell mt-1.5 text-sm"
          placeholder="Paste AIza... key to unlock PDF & image uploads"
          value={apiKey}
          onChange={(e) => {
            const val = e.target.value;
            setApiKey(val);
            try {
              if (val.trim()) window.localStorage.setItem(KEY_STORAGE, val.trim());
              else window.localStorage.removeItem(KEY_STORAGE);
            } catch {
              /* ignore */
            }
          }}
        />

        <div className="mt-3 rounded-2xl border-2 border-dashed border-[var(--line-strong)] bg-[var(--ink-2)] p-3.5">
          {!hasApiKey ? (
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-xs font-semibold text-[var(--amber)]">
                <Lock size={14} className="shrink-0" />
                Put your Gemini API key first to unlock PDF &amp; Screenshot uploads
              </p>
              <button
                type="button"
                disabled
                className="btn-secondary !min-h-[38px] shrink-0 !px-3 text-xs"
              >
                <FileUp size={14} /> Locked
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[var(--paper)]">
                  Ready for PDFs &amp; Exam Screenshots
                </p>
                <p className="text-[11px] text-[var(--muted)]">
                  Extracts questions, LaTeX math, and per-option explanations.
                </p>
              </div>
              <button
                type="button"
                onClick={() => mediaFileRef.current?.click()}
                className="btn-secondary !min-h-[38px] shrink-0 !px-3 text-xs"
              >
                <FileUp size={14} /> Upload PDF / Image
              </button>
            </div>
          )}
          <input
            ref={mediaFileRef}
            type="file"
            multiple
            accept=".pdf,application/pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              void handleMediaFiles(e.target.files);
              e.target.value = '';
            }}
          />

          {attachments.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--line)] pt-2.5">
              {attachments.map((att, idx) => {
                const isPdf = att.mimeType === 'application/pdf';
                return (
                  <div
                    key={`${att.name}-${idx}`}
                    className="pop inline-flex max-w-full items-center gap-2 rounded-xl bg-[var(--surface)] px-2.5 py-1.5 text-xs shadow-[0_0_0_1px_var(--line-strong)]"
                  >
                    {isPdf ? (
                      <FileText size={14} className="shrink-0 text-[var(--coral)]" />
                    ) : (
                      <ImageIcon size={14} className="shrink-0 text-[var(--peri)]" />
                    )}
                    <span className="truncate font-semibold text-[var(--paper)]">{att.name}</span>
                    {att.sizeBytes ? (
                      <span className="shrink-0 text-[11px] text-[var(--muted)] tabular">
                        {formatBytes(att.sizeBytes)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeAttachment(idx)}
                      className="press ml-0.5 rounded-full p-0.5 text-[var(--muted)] hover:text-[var(--coral)]"
                      aria-label={`Remove ${att.name}`}
                    >
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {hasApiKey ? (
          <div className="mt-3 flex items-center justify-between gap-3 px-0.5">
            <span className="text-xs text-[var(--muted)]">
              Also parse messy pasted notes with Gemini
            </span>
            <Toggle
              checked={effectiveUseGemini}
              onChange={setUseGemini}
              disabled={hasAttachments}
              label="Gemini smart parse"
            />
          </div>
        ) : null}
      </section>

      {/* 2. Ready-to-Copy AI Prompt for ChatGPT / Claude / Gemini */}
      <section className="mt-4 rounded-2xl bg-[var(--surface)] p-3.5 shadow-[0_0_0_1px_var(--line)]">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-[var(--paper)]">
              Generating questions with ChatGPT / Claude / Gemini?
            </p>
            <p className="text-[11px] text-[var(--muted)]">
              Copy this prompt so your AI outputs ready-to-paste Markdown + LaTeX + per-option explanations.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleCopyPrompt()}
            className="chip shrink-0 text-xs"
            data-active={copiedPrompt}
          >
            {copiedPrompt ? <Check size={14} /> : <Copy size={14} />}
            {copiedPrompt ? 'Copied! ✓' : 'Copy AI Prompt'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setPromptPreviewOpen((v) => !v)}
          aria-expanded={promptPreviewOpen}
          className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--paper)]"
        >
          <ChevronDown
            size={13}
            className={`transition-transform duration-200 ${promptPreviewOpen ? 'rotate-180' : ''}`}
          />
          {promptPreviewOpen ? 'Hide prompt preview' : 'Preview prompt'}
        </button>

        <div className="expander" data-open={promptPreviewOpen}>
          <div>
            <pre className="code-cell mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--ink-2)] p-3 text-[11px] leading-relaxed text-[var(--muted)] shadow-[0_0_0_1px_var(--line)]">
              {AI_PROMPT_FOR_MARKDOWN_QUESTIONS}
            </pre>
          </div>
        </div>
      </section>

      {/* 3. Title & Markdown Editor (always unlocked, no API key required) */}
      <label htmlFor="studio-title" className="label mt-4 block">
        Exam title
      </label>
      <input
        id="studio-title"
        className="field mt-1.5"
        placeholder="e.g. Physics & Calculus Review"
        value={title}
        maxLength={60}
        onChange={(e) => setTitle(e.target.value)}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="studio-md" className="label">
          Markdown questions (no API key needed)
        </label>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="chip h-8 min-h-0 px-3 text-xs"
            onClick={() => mdFileRef.current?.click()}
          >
            <FileUp size={13} /> Upload .md
          </button>
          <button
            type="button"
            className="chip h-8 min-h-0 px-3 text-xs"
            onClick={() => loadTemplate(MARKDOWN_FORMAT_GUIDE, title || 'Sample Format')}
          >
            <Wand2 size={13} className="text-[var(--lime)]" /> Format guide
          </button>
        </div>
        <input
          ref={mdFileRef}
          type="file"
          multiple
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          className="hidden"
          onChange={(e) => {
            void handleMarkdownFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      <textarea
        id="studio-md"
        value={markdown}
        onChange={(e) => setMarkdown(e.target.value)}
        spellCheck={false}
        placeholder={
          '### 1. What is the derivative of $f(x) = x^3 + 2x$?\n- A) $3x^2 + 2$\n- B) $x^2 + 2$\n- C) $3x + 2$\n- D) $3x^3$\n**Answer:** A\n**Explanation:** Using the power rule $\\frac{d}{dx}(x^n) = nx^{n-1}$.\n- **Explain A:** Correct — the derivative of $x^3$ is $3x^2$ and $2x$ is $2$.\n- **Explain B:** Incorrect — forgot to multiply by the exponent $3$.'
        }
        className="field code-cell mt-1.5 h-48 resize-none py-3 text-[13px] leading-relaxed"
      />

      {/* 4. Live Preview */}
      <div className="mt-5 flex items-center justify-between">
        <p className="label">Live Markdown &amp; LaTeX Preview</p>
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
        <p className="mt-2 rounded-2xl bg-[var(--surface)] px-4 py-5 text-center text-xs text-[var(--muted)] shadow-[0_0_0_1px_var(--line)]">
          {hasAttachments
            ? `${attachments.length} file(s) ready — tap Extract below.`
            : 'Paste Markdown above or upload a .md file. Parsed questions and LaTeX equations preview here live.'}
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
            const isOpen = expanded === i;
            return (
              <div
                key={q.id || i}
                className="overflow-hidden rounded-2xl bg-[var(--surface)] shadow-[0_0_0_1px_var(--line)]"
              >
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-4 py-3 text-left"
                  onClick={() => setExpanded(isOpen ? null : i)}
                  aria-expanded={isOpen}
                >
                  <span className="code-cell mt-0.5 text-xs font-bold text-[var(--muted)] tabular">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="line-clamp-2 flex-1 text-sm font-medium leading-snug">
                    <Markdown source={q.prompt} inline />
                  </span>
                  <span className="code-cell mt-0.5 rounded-md bg-[var(--lime)] px-1.5 text-xs font-bold text-[var(--ink)]">
                    {LETTERS[q.correctIndex] ?? '?'}
                  </span>
                </button>
                <div className="expander" data-open={isOpen}>
                  <div>
                    <ul className="space-y-1.5 px-4 pb-2">
                      {q.options.map((opt, oi) => (
                        <li
                          key={oi}
                          className="space-y-0.5 text-[13px]"
                          style={{
                            color: oi === q.correctIndex ? 'var(--lime)' : 'var(--muted)',
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <span className="code-cell mt-0.5 font-bold">{LETTERS[oi]}</span>
                            <span className="flex-1">
                              <Markdown source={opt} inline />
                            </span>
                            {oi === q.correctIndex ? (
                              <Check size={14} className="mt-0.5 shrink-0" />
                            ) : null}
                          </div>
                          {q.optionExplanations?.[oi] ? (
                            <p className="pl-5 text-[11px] text-[var(--faint)]">
                              <Markdown source={q.optionExplanations[oi]} inline />
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {q.explanation ? (
                      <div className="mx-4 mb-3 rounded-xl bg-[var(--ink-2)] px-3 py-2 text-xs leading-relaxed text-[var(--muted)]">
                        <Markdown source={q.explanation} />
                      </div>
                    ) : (
                      <p className="mx-4 mb-3 text-xs text-[var(--amber)]">
                        No explanation provided for this question.
                      </p>
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
