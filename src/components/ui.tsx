'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import katex from 'katex';
import { Crown, X } from 'lucide-react';
import type { MemberAnswerTag } from '@/types/exam';

/* -------------------------------------------------------------------------- */
/* Haptics + clipboard                                                         */
/* -------------------------------------------------------------------------- */

export function haptic(pattern: number | number[] = 8) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* unsupported */
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export function formatSeconds(ms: number): string {
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
}

/* -------------------------------------------------------------------------- */
/* Avatar                                                                      */
/* -------------------------------------------------------------------------- */

export type AvatarRing = 'none' | 'thinking' | 'locked' | 'correct' | 'wrong' | 'me';

export function Avatar({
  emoji,
  size = 44,
  ring = 'none',
  badge,
  host,
  className = '',
}: {
  emoji: string;
  size?: number;
  ring?: AvatarRing;
  badge?: string | null;
  host?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`avatar-ring shrink-0 ${className}`}
      data-ring={ring}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.52) }}
    >
      <span aria-hidden>{emoji}</span>
      {badge ? (
        <span
          key={badge}
          className="pop absolute -right-1.5 -top-1.5 flex items-center justify-center rounded-full bg-[var(--paper)] shadow-md"
          style={{ width: Math.max(18, size * 0.42), height: Math.max(18, size * 0.42), fontSize: Math.max(10, size * 0.24) }}
          aria-label={`Status ${badge}`}
        >
          {badge}
        </span>
      ) : null}
      {host ? (
        <span
          className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 items-center justify-center rounded-full bg-[var(--amber)] text-[var(--ink)]"
          style={{ width: 16, height: 16 }}
          aria-label="Host"
        >
          <Crown size={10} strokeWidth={2.75} />
        </span>
      ) : null}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Member answer tag                                                           */
/* -------------------------------------------------------------------------- */

export function MemberTag({
  tag,
  showResult,
  delay = 0,
}: {
  tag: MemberAnswerTag;
  showResult: boolean;
  delay?: number;
}) {
  return (
    <span
      className="member-tag"
      data-me={tag.isMe}
      data-result={showResult ? (tag.isCorrect ? 'correct' : 'wrong') : undefined}
      style={{ animationDelay: `${delay}ms` }}
      title={`${tag.name} picked this · ${formatSeconds(tag.timeMs)}`}
    >
      <span className="tag-avatar" aria-hidden>
        {tag.avatar}
      </span>
      {tag.isMe ? 'You' : tag.name}
      {tag.order === 1 ? <span className="text-[10px] opacity-60">1st</span> : null}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Markdown + KaTeX LaTeX renderer                                             */
/* -------------------------------------------------------------------------- */

function renderKatexHtml(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex.trim(), {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
    });
  } catch {
    return latex;
  }
}

/**
 * Tokenizes inline math (`$$...$$`, `\[...\]`, `\(...\)`, `$...$`), code (`` `...` ``),
 * and bold/italic (`**...**`, `__...__`, `*...*`, `_..._`).
 * Math is matched BEFORE bold/italic so LaTeX subscripts like `$E_k$` are never mangled.
 */
const INLINE_TOKEN_RE =
  /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$(?!\s)(?:\\.|[^$\n\\])+?(?<!\s)\$|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|(?<![a-zA-Z0-9])_[^_\s][^_]*_(?![a-zA-Z0-9]))/g;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(INLINE_TOKEN_RE).filter((p) => p !== '');
  return parts.map((part, i) => {
    const key = `${keyBase}-${i}`;
    // Display math: $$...$$ or \[...\]
    if (
      (part.startsWith('$$') && part.endsWith('$$') && part.length > 4) ||
      (part.startsWith('\\[') && part.endsWith('\\]') && part.length > 4)
    ) {
      const expr = part.slice(2, -2);
      const html = renderKatexHtml(expr, true);
      return (
        <span
          key={key}
          dir="ltr"
          className="my-1 block overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }
    // Inline math: \(...\)
    if (part.startsWith('\\(') && part.endsWith('\\)') && part.length > 4) {
      const expr = part.slice(2, -2);
      const html = renderKatexHtml(expr, false);
      return (
        <span
          key={key}
          dir="ltr"
          className="inline-block align-middle"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }
    // Inline math: $...$
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      const expr = part.slice(1, -1);
      const html = renderKatexHtml(expr, false);
      return (
        <span
          key={key}
          dir="ltr"
          className="inline-block align-middle"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }
    if (
      (part.startsWith('**') && part.endsWith('**')) ||
      (part.startsWith('__') && part.endsWith('__'))
    ) {
      return <strong key={key}>{renderInline(part.slice(2, -2), `${key}-b`)}</strong>;
    }
    if (
      (part.startsWith('*') && part.endsWith('*')) ||
      (part.startsWith('_') && part.endsWith('_'))
    ) {
      if (part.length > 2) return <em key={key}>{renderInline(part.slice(1, -1), `${key}-i`)}</em>;
    }
    return <span key={key}>{part}</span>;
  });
}

export function Markdown({
  source,
  className = '',
  inline = false,
}: {
  source: string;
  className?: string;
  inline?: boolean;
}) {
  if (inline) {
    return (
      <span dir="auto" className={`md ${className}`}>
        {renderInline(source || '', 'inl')}
      </span>
    );
  }

  const lines = (source || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code blocks
    if (line.trim().startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code.push(lines[i]);
        i++;
      }
      i++;
      blocks.push(
        <pre key={`b${k++}`} dir="ltr">
          <code>{code.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Multi-line $$...$$ display math block
    if (line.trim().startsWith('$$') && !line.trim().slice(2).includes('$$')) {
      const mathLines: string[] = [line.trim().slice(2)];
      i++;
      while (i < lines.length && !lines[i].includes('$$')) {
        mathLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        mathLines.push(lines[i].replace(/\$\$.*$/, ''));
        i++;
      }
      const html = renderKatexHtml(mathLines.join('\n'), true);
      blocks.push(
        <div
          key={`b${k++}`}
          dir="ltr"
          className="my-2 overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
      continue;
    }

    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ''));
        i++;
      }
      const bk = `b${k++}`;
      blocks.push(
        <ul key={bk} dir="auto">
          {items.map((it, j) => (
            <li key={`${bk}-${j}`}>{renderInline(it, `${bk}-${j}`)}</li>
          ))}
        </ul>
      );
      continue;
    }
    if (line.trim() === '') {
      i++;
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])
    ) {
      para.push(lines[i].replace(/^>\s?/, '').replace(/^#+\s*/, ''));
      i++;
    }
    const bk = `b${k++}`;
    blocks.push(
      <p key={bk} dir="auto">
        {renderInline(para.join(' '), bk)}
      </p>
    );
  }

  return (
    <div dir="auto" className={`md ${className}`}>
      {blocks}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Bottom sheet                                                                */
/* -------------------------------------------------------------------------- */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  tall = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  tall?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        className="sheet-backdrop absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`sheet relative flex flex-col rounded-t-[28px] bg-[var(--ink-2)] shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.8)] outline-none ${
          tall ? 'h-[94%]' : 'max-h-[88%]'
        }`}
        style={{ boxShadow: '0 -1px 0 rgba(255,255,255,0.08), 0 -20px 60px -20px rgba(0,0,0,0.8)' }}
      >
        <div className="flex justify-center pt-2.5">
          <span className="h-1 w-10 rounded-full bg-white/15" />
        </div>
        <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-2">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="scroll-area px-5 pb-4">{children}</div>
        {footer ? <div className="pb-safe border-t border-[var(--line)] px-5 pt-3">{footer}</div> : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Toggle switch                                                               */
/* -------------------------------------------------------------------------- */

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        haptic(6);
        onChange(!checked);
      }}
      className="press relative h-7 w-12 shrink-0 rounded-full disabled:opacity-40"
      style={{
        background: checked ? 'var(--lime)' : 'var(--surface-3)',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
      }}
    >
      <span
        className="absolute top-0.5 h-6 w-6 rounded-full shadow-md transition-all duration-300"
        style={{
          left: checked ? 'calc(100% - 26px)' : '2px',
          background: checked ? 'var(--ink)' : 'var(--paper)',
          transitionTimingFunction: 'var(--ease-out)',
        }}
      />
    </button>
  );
}
