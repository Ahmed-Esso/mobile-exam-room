import { MemberAnswer, Question } from '@/types/exam';

export interface ExportQuestionsPdfParams {
  title: string;
  roomCode: string;
  playerName: string;
  score: number;
  correctCount: number;
  totalCount: number;
  questions: Question[];
  answers: Record<number, MemberAnswer>;
  mode?: 'missed' | 'all';
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInlineMarkdownWithKatex(
  text: string,
  katexMod: typeof import('katex') | null
): string {
  if (!text) return '';

  const mathTokens: string[] = [];
  const stashMath = (latex: string, displayMode: boolean) => {
    const idx = mathTokens.length;
    let rendered = escapeHtml(latex);
    if (katexMod) {
      try {
        rendered = katexMod.renderToString(latex.trim(), {
          displayMode,
          throwOnError: false,
          strict: false,
        });
      } catch {
        rendered = escapeHtml(latex);
      }
    }
    mathTokens.push(
      displayMode
        ? `<div style="margin:6px 0;text-align:center;direction:ltr;">${rendered}</div>`
        : `<span style="direction:ltr;unicode-bidi:isolate;">${rendered}</span>`
    );
    return `@@MATH_${idx}@@`;
  };

  let src = text;
  src = src.replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => stashMath(m, true));
  src = src.replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => stashMath(m, true));
  src = src.replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => stashMath(m, false));
  src = src.replace(/(?<!\\)\$([^\n$]+?)(?<!\\)\$/g, (_, m) =>
    stashMath(m, false)
  );

  let html = escapeHtml(src);
  html = html.replace(
    /`([^`]+)`/g,
    '<code style="background:#f1f5f9;padding:1px 5px;border-radius:4px;font-family:monospace;font-size:0.9em;color:#0f172a;">$1</code>'
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\n/g, '<br/>');

  html = html.replace(/@@MATH_(\d+)@@/g, (_, idxStr) => {
    return mathTokens[Number(idxStr)] || '';
  });

  return html;
}

/**
 * Generates and downloads a crisp white-paper A4 PDF study sheet for missed (or all) questions,
 * supporting KaTeX math formulas, Arabic/English RTL/LTR text, and per-option NotebookLM explanations
 * without slicing question cards across page boundaries.
 */
export async function exportQuestionsPdf(
  params: ExportQuestionsPdfParams
): Promise<{ exportedCount: number; filename: string }> {
  const mode = params.mode || 'missed';
  const targetItems = params.questions
    .map((q, idx) => ({
      question: q,
      index: idx,
      answer: params.answers[idx],
    }))
    .filter((item) => {
      if (mode === 'all') return true;
      return !item.answer || !item.answer.isCorrect;
    });

  if (targetItems.length === 0) {
    throw new Error('No wrong or unanswered questions to export!');
  }

  let katexMod: typeof import('katex') | null = null;
  try {
    const k = await import('katex');
    katexMod = (k.default || k) as typeof import('katex');
  } catch {
    katexMod = null;
  }

  const filenameBase = (params.title || 'exam-review')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const filename = `${filenameBase || 'exam'}-${mode}-review.pdf`;

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.width = '794px';
  container.style.background = '#ffffff';
  container.style.color = '#0f172a';
  container.style.fontFamily =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Arabic", Arial, sans-serif';
  container.style.padding = '28px 34px';
  container.style.boxSizing = 'border-box';
  container.style.lineHeight = '1.5';

  const accuracy =
    params.totalCount > 0
      ? Math.round((params.correctCount / params.totalCount) * 100)
      : 0;
  const dateStr = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const headerEl = document.createElement('div');
  headerEl.setAttribute('data-pdf-block', 'header');
  headerEl.style.borderBottom = '2px solid #0f172a';
  headerEl.style.paddingBottom = '14px';
  headerEl.style.marginBottom = '18px';
  headerEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
      <div>
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#475569;">
          ${mode === 'missed' ? 'Wrong &amp; Unanswered Questions Review' : 'Full Exam Study Sheet'}
        </div>
        <h1 dir="auto" style="margin:4px 0 0 0;font-size:22px;font-weight:800;color:#0f172a;">
          ${escapeHtml(params.title || 'Live Exam Room')}
        </h1>
      </div>
      <div style="text-align:right;font-size:12px;color:#334155;">
        <div style="font-weight:700;color:#0f172a;">${escapeHtml(params.playerName)}</div>
        <div>Room ${escapeHtml(params.roomCode)} · ${escapeHtml(dateStr)}</div>
      </div>
    </div>
    <div style="display:flex;gap:16px;margin-top:10px;font-size:12px;font-weight:600;color:#1e293b;">
      <span style="background:#f1f5f9;padding:4px 10px;border-radius:6px;">Score: ${params.score.toLocaleString()} pts</span>
      <span style="background:#f1f5f9;padding:4px 10px;border-radius:6px;">Accuracy: ${accuracy}% (${params.correctCount}/${params.totalCount})</span>
      <span style="background:#fef2f2;color:#b91c1c;padding:4px 10px;border-radius:6px;">Reviewing: ${targetItems.length} question${targetItems.length === 1 ? '' : 's'}</span>
    </div>
  `;
  container.appendChild(headerEl);

  for (const item of targetItems) {
    const q = item.question;
    const ans = item.answer;
    const card = document.createElement('div');
    card.setAttribute('data-pdf-block', 'question');
    card.style.border = '1px solid #cbd5e1';
    card.style.borderRadius = '12px';
    card.style.padding = '16px 18px';
    card.style.marginBottom = '16px';
    card.style.background = '#ffffff';
    card.style.boxSizing = 'border-box';

    const statusBadge = !ans
      ? '<span style="background:#f1f5f9;color:#475569;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;">Unanswered</span>'
      : ans.isCorrect
      ? '<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;">Correct</span>'
      : '<span style="background:#fee2e2;color:#b91c1c;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;">Missed</span>';

    const optionsHtml = q.options
      .map((opt, oIdx) => {
        const letter = String.fromCharCode(65 + oIdx);
        const isCorrectOpt = oIdx === q.correctIndex;
        const isMyWrongPick = ans && !ans.isCorrect && ans.optionIndex === oIdx;

        let border = '1px solid #e2e8f0';
        let bg = '#ffffff';
        let badgeHtml = '';

        if (isCorrectOpt) {
          border = '1.5px solid #16a34a';
          bg = '#f0fdf4';
          badgeHtml =
            '<span style="background:#16a34a;color:#ffffff;padding:1px 7px;border-radius:999px;font-size:10px;font-weight:700;">Correct Answer</span>';
        } else if (isMyWrongPick) {
          border = '1.5px solid #dc2626';
          bg = '#fef2f2';
          badgeHtml =
            '<span style="background:#dc2626;color:#ffffff;padding:1px 7px;border-radius:999px;font-size:10px;font-weight:700;">Your Pick</span>';
        }

        const optExplain = q.optionExplanations?.[oIdx]
          ? `<div dir="auto" style="margin-top:6px;padding-top:6px;border-top:1px dashed #cbd5e1;font-size:11.5px;color:#334155;">${renderInlineMarkdownWithKatex(
              q.optionExplanations[oIdx],
              katexMod
            )}</div>`
          : '';

        return `
          <div style="border:${border};background:${bg};border-radius:8px;padding:8px 11px;margin-top:7px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
              <div dir="auto" style="font-size:13px;color:#0f172a;flex:1;">
                <strong style="margin-right:6px;">${letter})</strong>
                ${renderInlineMarkdownWithKatex(opt, katexMod)}
              </div>
              ${badgeHtml}
            </div>
            ${optExplain}
          </div>
        `;
      })
      .join('');

    const codeHtml = q.codeSnippet
      ? `<pre style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;font-size:11.5px;overflow:hidden;white-space:pre-wrap;color:#0f172a;margin:8px 0;">${escapeHtml(
          q.codeSnippet
        )}</pre>`
      : '';

    const mainExplanationHtml = q.explanation
      ? `<div dir="auto" style="margin-top:10px;padding:10px 12px;background:#f8fafc;border-left:3px solid #0f172a;border-radius:6px;font-size:12.5px;color:#1e293b;">
          <strong style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#475569;margin-bottom:3px;">Explanation</strong>
          ${renderInlineMarkdownWithKatex(q.explanation, katexMod)}
        </div>`
      : '';

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:11.5px;font-weight:700;color:#475569;">Question ${item.index + 1}</span>
        ${statusBadge}
      </div>
      <div dir="auto" style="font-size:14.5px;font-weight:700;color:#0f172a;margin-bottom:6px;">
        ${renderInlineMarkdownWithKatex(q.prompt, katexMod)}
      </div>
      ${codeHtml}
      <div>${optionsHtml}</div>
      ${mainExplanationHtml}
    `;

    container.appendChild(card);
  }

  document.body.appendChild(container);

  try {
    const [{ jsPDF }, html2canvasModule] = await Promise.all([
      import('jspdf'),
      import('html2canvas'),
    ]);
    const html2canvas = html2canvasModule.default || html2canvasModule;

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const usableWidth = pageWidth - margin * 2;
    let cursorY = margin;

    const blocks = Array.from(
      container.querySelectorAll('[data-pdf-block]')
    ) as HTMLElement[];

    for (let i = 0; i < blocks.length; i++) {
      const blockEl = blocks[i];
      const canvas = await html2canvas(blockEl, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const imgHeightMm = (canvas.height * usableWidth) / canvas.width;

      // If block doesn't fit on remaining page space and we're not at top of page, start a new page
      if (cursorY > margin && cursorY + imgHeightMm > pageHeight - margin) {
        pdf.addPage();
        cursorY = margin;
      }

      // If a single extraordinarily tall card exceeds an entire page height, scale it slightly to fit one page cleanly
      if (imgHeightMm > pageHeight - margin * 2) {
        const scaleDown = (pageHeight - margin * 2) / imgHeightMm;
        const scaledW = usableWidth * scaleDown;
        const scaledH = pageHeight - margin * 2;
        const offsetX = margin + (usableWidth - scaledW) / 2;
        pdf.addImage(imgData, 'PNG', offsetX, cursorY, scaledW, scaledH);
        cursorY += scaledH + 4;
      } else {
        pdf.addImage(imgData, 'PNG', margin, cursorY, usableWidth, imgHeightMm);
        cursorY += imgHeightMm + 4;
      }
    }

    pdf.save(filename);
    return { exportedCount: targetItems.length, filename };
  } catch (err) {
    // Graceful print fallback if canvas rendering fails on restricted mobile webviews
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
      return { exportedCount: targetItems.length, filename };
    }
    throw err;
  } finally {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}
