'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
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
import ProfileEditSheet from './ProfileEditSheet';

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
  const [studioTab, setStudioTab] = useState<'markdown' | 'ai'>('markdown');
  const [markdown, setMarkdown] = useState('');
  const [debounced, setDebounced] = useState('');
  const [title, setTitle] = useState('');
  const [attachments, setAttachments] = useState<QuestionAttachment[]>([]);
  const [useGemini, setUseGemini] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showAllPreview, setShowAllPreview] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const mdFileRef = useRef<HTMLInputElement>(null);
  const mediaFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setShowAllPreview(false);
    if (api.geminiApiKey) {
      setApiKey(api.geminiApiKey);
      return;
    }
    try {
      setApiKey(window.localStorage.getItem(KEY_STORAGE) ?? '');
    } catch {
      /* ignore */
    }
  }, [open, api.geminiApiKey]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(markdown), 220);
    return () => window.clearTimeout(t);
  }, [markdown]);

  const deferredMarkdown = useDeferredValue(debounced);

  const preview = useMemo(() => {
    if (!deferredMarkdown.trim()) return null;
    try {
      return parseMarkdownQuestions(deferredMarkdown);
    } catch {
      return {
        questions: [],
        source: 'markdown' as const,
        warnings: ['Could not parse this Markdown.'],
      };
    }
  }, [deferredMarkdown]);

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
      api.setGeminiApiKey(apiKey.trim());
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
            text: `Loaded ${res.questions.length} questions`,
          });
          setTimeout(onClose, 380);
        } else {
          setResult({
            ok: false,
            text: res?.warnings?.[0] ?? 'Could not extract questions.',
          });
        }
      } else if (preview && preview.questions.length > 0) {
        await api.setQuestions(preview.questions, title.trim() || undefined);
        setResult({ ok: true, text: `Loaded ${preview.questions.length} questions` });
        setTimeout(onClose, 320);
      } else {
        setResult({
          ok: false,
          text: preview?.warnings?.[0] ?? 'No complete questions detected.',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        tall
        title="Question Studio"
        footer={
          <div className="space-y-2">
            {result ? (
              <p
                className="rise flex items-center gap-2 text-xs font-medium"
                style={{ color: result.ok ? 'var(--lime)' : 'var(--coral)' }}
                role="status"
              >
                {result.ok ? <Check size={15} /> : <AlertTriangle size={15} />}
                {result.text}
              </p>
            ) : null}
            <button
              type="button"
              className="btn-primary h-12 w-full text-sm"
              disabled={!canSave || saving}
              onClick={save}
            >
              {saving ? (
                <Loader2 size={18} className="animate-spin" />
              ) : effectiveUseGemini ? (
                <Sparkles size={17} />
              ) : (
                <Check size={17} strokeWidth={2.6} />
              )}
              {saving
                ? 'Extracting questions…'
                : hasAttachments
                ? `Extract from ${attachments.length} ${attachments.length === 1 ? 'file' : 'files'}`
                : effectiveUseGemini
                ? 'Smart Parse with Gemini'
                : count
                ? `Use ${count} ${count === 1 ? 'question' : 'questions'}`
                : 'Add questions to continue'}
            </button>
          </div>
        }
      >
        <div className="space-y-3 pb-2">
          {/* Clean 2-Tab Switcher */}
          <div className="grid grid-cols-2 rounded-xl bg-[var(--ink-2)] p-1 shadow-[0_0_0_1px_var(--line)]">
            <button
              type="button"
              onClick={() => {
                haptic(5);
                setStudioTab('markdown');
              }}
              className="press flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold"
              style={{
                background: studioTab === 'markdown' ? 'var(--surface-3)' : 'transparent',
                color: studioTab === 'markdown' ? 'var(--paper)' : 'var(--muted)',
              }}
            >
              <FileText size={13} /> Paste Markdown
            </button>
            <button
              type="button"
              onClick={() => {
                haptic(5);
                setStudioTab('ai');
              }}
              className="press flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold"
              style={{
                background: studioTab === 'ai' ? 'var(--surface-3)' : 'transparent',
                color: studioTab === 'ai' ? 'var(--paper)' : 'var(--muted)',
              }}
            >
              <Sparkles size={13} /> PDF / Image (AI)
              {hasAttachments ? (
                <span className="rounded-full bg-[var(--lime)] px-1.5 text-[10px] font-extrabold text-[var(--ink)]">
                  {attachments.length}
                </span>
              ) : null}
            </button>
          </div>

          {/* Shared Compact Title Input */}
          <input
            id="studio-title"
            className="field !min-h-[42px] text-sm"
            placeholder="Exam title (optional)"
            aria-label="Exam title"
            value={title}
            maxLength={60}
            onChange={(e) => setTitle(e.target.value)}
          />

          {studioTab === 'markdown' ? (
            <div className="space-y-2.5">
              {/* 1-Row Quick Actions */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleCopyPrompt()}
                  className="chip !h-8 !min-h-0 !px-2.5 text-xs"
                  data-active={copiedPrompt}
                >
                  {copiedPrompt ? <Check size={13} /> : <Copy size={13} />}
                  {copiedPrompt ? 'Copied! ✓' : 'Copy AI Prompt'}
                </button>
                <button
                  type="button"
                  className="chip !h-8 !min-h-0 !px-2.5 text-xs"
                  onClick={() => mdFileRef.current?.click()}
                >
                  <FileUp size={13} /> Upload .md
                </button>
                <button
                  type="button"
                  className="chip !h-8 !min-h-0 !px-2.5 text-xs"
                  onClick={() => loadTemplate(MARKDOWN_FORMAT_GUIDE, title || 'Sample Exam')}
                >
                  <Wand2 size={13} className="text-[var(--lime)]" /> Sample
                </button>
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

              {/* Clean Markdown Textarea */}
              <textarea
                id="studio-md"
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                spellCheck={false}
                placeholder={'### 1. Question text?\n- A) Option 1\n- B) Option 2\n**Answer:** A\n**Explanation:** Why A is correct.'}
                className="field code-cell h-44 resize-none py-2.5 text-xs leading-relaxed"
              />

              {/* Compact Question Count + Expandable Preview */}
              {preview ? (
                <div className="rounded-xl bg-[var(--surface)] shadow-[0_0_0_1px_var(--line)]">
                  <button
                    type="button"
                    onClick={() => setPreviewOpen((v) => !v)}
                    className="flex w-full items-center justify-between px-3 py-2 text-xs"
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular"
                        style={{
                          background: count ? 'var(--lime)' : 'var(--surface-3)',
                          color: count ? 'var(--ink)' : 'var(--muted)',
                        }}
                      >
                        {count} {count === 1 ? 'question' : 'questions'} ready
                      </span>
                    </span>
                    {count > 0 ? (
                      <span className="flex items-center gap-1 text-[var(--muted)]">
                        {previewOpen ? 'Hide' : 'Preview'}
                        <ChevronDown
                          size={14}
                          className={`transition-transform ${previewOpen ? 'rotate-180' : ''}`}
                        />
                      </span>
                    ) : null}
                  </button>

                  {preview.warnings?.length ? (
                    <div className="space-y-1 border-t border-[var(--line)] px-3 py-2 text-[11px] text-[var(--amber)]">
                      {preview.warnings.slice(0, 3).map((w, wi) => (
                        <p key={wi} className="flex items-start gap-1.5">
                          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                          <span>{w}</span>
                        </p>
                      ))}
                      {preview.warnings.length > 3 ? (
                        <p className="text-[10px] opacity-80">
                          +{preview.warnings.length - 3} more parser warnings
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {previewOpen && count > 0 ? (
                    <div className="space-y-1.5 border-t border-[var(--line)] p-2">
                      {(showAllPreview ? preview.questions : preview.questions.slice(0, 25)).map((q, i) => {
                        const isOpen = expanded === i;
                        return (
                          <div
                            key={q.id || i}
                            className="overflow-hidden rounded-xl bg-[var(--ink-2)] shadow-[0_0_0_1px_var(--line)]"
                          >
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
                              onClick={() => setExpanded(isOpen ? null : i)}
                              aria-expanded={isOpen}
                            >
                              <span className="code-cell font-bold text-[var(--muted)] tabular">
                                {String(i + 1).padStart(2, '0')}
                              </span>
                              <span className="line-clamp-1 flex-1 font-medium">
                                <Markdown source={q.prompt} inline />
                              </span>
                              <span className="code-cell rounded bg-[var(--lime)] px-1.5 text-[10px] font-bold text-[var(--ink)]">
                                {LETTERS[q.correctIndex] ?? '?'}
                              </span>
                            </button>
                            {isOpen ? (
                              <ul className="space-y-1 border-t border-[var(--line)] px-3 py-2 text-[11px]">
                                {q.options.map((opt, oi) => (
                                  <li
                                    key={oi}
                                    className="flex items-baseline gap-1.5"
                                    style={{
                                      color: oi === q.correctIndex ? 'var(--lime)' : 'var(--muted)',
                                    }}
                                  >
                                    <span className="code-cell font-bold">{LETTERS[oi]}.</span>
                                    <Markdown source={opt} inline />
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        );
                      })}
                      {preview.questions.length > 25 ? (
                        <button
                          type="button"
                          onClick={() => setShowAllPreview((v) => !v)}
                          className="btn-secondary !min-h-[34px] w-full !rounded-xl text-xs"
                        >
                          {showAllPreview
                            ? 'Show first 25 questions'
                            : `Show all ${preview.questions.length} questions`}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            /* Tab 2: Clean PDF / Image AI Extractor */
            <div className="space-y-3">
              {api.geminiApiKey.trim() ? (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-[rgba(215,255,63,0.12)] px-3 py-2 text-xs font-semibold text-[var(--lime)]">
                  <span className="flex items-center gap-1.5">
                    <Check size={14} className="shrink-0" />
                    Key loaded from Profile
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      haptic(5);
                      setProfileOpen(true);
                    }}
                    className="underline underline-offset-2"
                  >
                    Edit
                  </button>
                </div>
              ) : null}

              {!hasApiKey ? (
                <div className="space-y-2.5 rounded-2xl bg-[var(--surface)] p-3.5 shadow-[0_0_0_1px_var(--line)]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--amber)]">
                      <Lock size={14} /> Gemini API key required
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        haptic(6);
                        setProfileOpen(true);
                      }}
                      className="btn-secondary !min-h-[32px] !rounded-lg !px-2.5 text-xs"
                    >
                      <KeyRound size={12} /> Add API Key in Profile
                    </button>
                  </div>
                  <input
                    id="gemini-key"
                    type="password"
                    autoComplete="off"
                    className="field code-cell !min-h-[40px] text-xs"
                    placeholder="Or paste AIza... key here"
                    value={apiKey}
                    onChange={(e) => {
                      const val = e.target.value;
                      setApiKey(val);
                      api.setGeminiApiKey(val.trim());
                      try {
                        if (val.trim()) window.localStorage.setItem(KEY_STORAGE, val.trim());
                        else window.localStorage.removeItem(KEY_STORAGE);
                      } catch {
                        /* ignore */
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="space-y-2.5 rounded-2xl border-2 border-dashed border-[var(--line-strong)] bg-[var(--ink-2)] p-4 text-center">
                  <button
                    type="button"
                    onClick={() => mediaFileRef.current?.click()}
                    className="btn-secondary mx-auto !min-h-[40px] !px-4 text-xs"
                  >
                    <FileUp size={15} /> Choose PDF or Images
                  </button>

                  {attachments.length > 0 ? (
                    <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                      {attachments.map((att, idx) => {
                        const isPdf = att.mimeType === 'application/pdf';
                        return (
                          <div
                            key={`${att.name}-${idx}`}
                            className="pop inline-flex max-w-full items-center gap-1.5 rounded-xl bg-[var(--surface)] px-2.5 py-1 text-xs shadow-[0_0_0_1px_var(--line-strong)]"
                          >
                            {isPdf ? (
                              <FileText size={13} className="shrink-0 text-[var(--coral)]" />
                            ) : (
                              <ImageIcon size={13} className="shrink-0 text-[var(--peri)]" />
                            )}
                            <span className="max-w-[140px] truncate font-semibold">
                              {att.name}
                            </span>
                            {att.sizeBytes ? (
                              <span className="text-[10px] text-[var(--muted)] tabular">
                                {formatBytes(att.sizeBytes)}
                              </span>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => removeAttachment(idx)}
                              className="press rounded-full p-0.5 text-[var(--muted)] hover:text-[var(--coral)]"
                              aria-label={`Remove ${att.name}`}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              )}

              <input
                ref={mediaFileRef}
                type="file"
                multiple
                accept="application/pdf,.pdf,image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  void handleMediaFiles(e.target.files);
                  e.target.value = '';
                }}
              />

              {hasApiKey ? (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface)] px-3 py-2 shadow-[0_0_0_1px_var(--line)]">
                  <span className="text-xs text-[var(--muted)]">
                    Also smart-parse pasted Markdown
                  </span>
                  <Toggle
                    checked={effectiveUseGemini}
                    onChange={setUseGemini}
                    disabled={hasAttachments}
                    label="Gemini smart parse"
                  />
                </div>
              ) : null}
            </div>
          )}
        </div>
      </Sheet>
      <ProfileEditSheet open={profileOpen} onClose={() => setProfileOpen(false)} api={api} />
    </>
  );
}
