import { ParseQuestionsResult, Question } from '@/types/exam';

export const AI_PROMPT_FOR_MARKDOWN_QUESTIONS = `Generate multiple-choice exam questions from the provided topic/notes in clean Markdown format so I can paste them directly into my Live Exam Room app.

Follow these strict formatting rules:
1. Wrap ALL math equations, formulas, fractions, exponents, subscripts, Greek letters, and chemical/physics symbols in LaTeX ($...$ for inline, $$...$$ for display math).
2. Preserve the language of my source material (if Arabic, write questions, options, and explanations in Arabic while keeping LaTeX inside $...$; if English, write in English).
3. Include a brief core takeaway AND a 1-sentence explanation for EACH option A, B, C, D explaining why that option is right or wrong.

Use this exact Markdown structure for every question, separated by ---:

### 1. [Question text]
- A) [Option A]
- B) [Option B]
- C) [Option C]
- D) [Option D]
**Answer:** [A/B/C/D]
**Explanation:** [Brief core takeaway]
- **Explain A:** [Why A is correct or incorrect in 1 short sentence]
- **Explain B:** [Why B is correct or incorrect in 1 short sentence]
- **Explain C:** [Why C is correct or incorrect in 1 short sentence]
- **Explain D:** [Why D is correct or incorrect in 1 short sentence]

---`;

export const MARKDOWN_FORMAT_GUIDE = `# Sample Format (Markdown + LaTeX + Per-Option Explanations)

### 1. What is the kinetic energy of a particle with mass $m$ and velocity $v$?
- A) $E_k = mv$
- B) $E_k = \\frac{1}{2}mv^2$
- C) $E_k = mc^2$
- D) $E_k = mgh$
**Answer:** B
**Explanation:** Classical kinetic energy equals $\\frac{1}{2}mv^2$, derived from integrating work $W = \\int m v \\, dv$.
- **Explain A:** $mv$ is linear momentum $p$, not kinetic energy.
- **Explain B:** Correct! Integrating force over displacement yields $\\frac{1}{2}mv^2$.
- **Explain C:** $mc^2$ is relativistic rest-mass energy, not classical kinetic energy.
- **Explain D:** $mgh$ is gravitational potential energy near Earth's surface.

---

### 2. Which HTTP status code indicates rate-limiting?
- [ ] 401 Unauthorized
- [ ] 403 Forbidden
- [x] 429 Too Many Requests
- [ ] 503 Service Unavailable
> **Explanation:** **429 Too Many Requests** indicates the client sent too many requests in a given window.`;

const ARABIC_LETTER_MAP: Record<string, number> = {
  أ: 0,
  ا: 0,
  ب: 1,
  ج: 2,
  د: 3,
  ه: 4,
  هـ: 4,
  و: 5,
};

function letterToIndex(letter: string): number {
  const upper = letter.toUpperCase();
  if (/^[A-F]$/.test(upper)) {
    return upper.charCodeAt(0) - 65;
  }
  if (ARABIC_LETTER_MAP[letter] !== undefined) {
    return ARABIC_LETTER_MAP[letter];
  }
  return -1;
}

/**
 * Deterministic, flexible Markdown Question Parser with full LaTeX ($...$, $$...$$, \(...\), \[...\]),
 * NotebookLM-style per-option explanations (- **Explain A:** ...), and bilingual (English + Arabic) support.
 */
export function parseMarkdownQuestions(markdown: string): ParseQuestionsResult {
  const warnings: string[] = [];
  const normalized = markdown.replace(/\r\n/g, '\n').trim();

  if (!normalized) {
    return { questions: [], source: 'markdown', warnings: ['Empty markdown input.'] };
  }

  const blocks = splitIntoQuestionBlocks(normalized);
  const questions: Question[] = [];

  blocks.forEach((rawBlock, idx) => {
    const parsed = parseSingleBlock(rawBlock, idx);
    if (parsed) {
      questions.push(parsed);
    }
  });

  if (questions.length === 0) {
    warnings.push(
      'Could not detect structured questions with options. Make sure each question has at least 2 options (e.g., A), B), C), D) or - [ ] / - [x]), or enable Gemini AI Smart Parse.'
    );
  }

  return {
    questions,
    source: 'markdown',
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function splitIntoQuestionBlocks(markdown: string): string[] {
  const lines = markdown.split('\n');
  const cleanedLines: string[] = [];
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      inCodeFence = !inCodeFence;
    }
    if (!inCodeFence && i === 0 && /^#\s+[^#]/.test(line.trim())) {
      continue;
    }
    cleanedLines.push(line);
  }

  const body = cleanedLines.join('\n').trim();

  const hrBlocks = splitByOutsideCodeAndMath(body, /^---+$/m);
  if (hrBlocks.length > 1) {
    return hrBlocks.flatMap((b) => splitByQuestionHeaders(b));
  }

  return splitByQuestionHeaders(body);
}

function splitByOutsideCodeAndMath(text: string, delimiterRegex: RegExp): string[] {
  const lines = text.split('\n');
  const chunks: string[] = [];
  let current: string[] = [];
  let inCode = false;
  let inMathBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCode = !inCode;
    }
    if (!inCode && trimmed.startsWith('$$') && (trimmed === '$$' || !trimmed.slice(2).includes('$$'))) {
      inMathBlock = !inMathBlock;
    }
    if (!inCode && !inMathBlock && delimiterRegex.test(trimmed)) {
      if (current.join('\n').trim()) {
        chunks.push(current.join('\n').trim());
      }
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.join('\n').trim()) {
    chunks.push(current.join('\n').trim());
  }
  return chunks;
}

function splitByQuestionHeaders(text: string): string[] {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  let inCode = false;

  const headerPattern =
    /^(?:#{2,4}\s*(?:Q(?:uestion)?\s*\d*[:.)]?\s*|س(?:ؤال)?\s*\d*[:.)]?\s*|\d+[:.)]\s*)?|(?:Q(?:uestion)?\s*\d+[:.)]\s*)|(?:س(?:ؤال)?\s*\d+[:.)]\s*)|\*\*(?:Q(?:uestion)?\s*\d+|س(?:ؤال)?\s*\d+|\d+)[.:)]\*\*|\d+[.)]\s+\S+)/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCode = !inCode;
    }

    const isHeader =
      !inCode &&
      headerPattern.test(trimmed) &&
      !/^[-*]\s/.test(trimmed) &&
      !/^[A-Fa-fأابجده][.)]\s/.test(trimmed);

    if (isHeader && current.length > 0 && hasOptionLikeLines(current.join('\n'))) {
      blocks.push(current.join('\n').trim());
      current = [line];
    } else {
      current.push(line);
    }
  }

  if (current.join('\n').trim()) {
    blocks.push(current.join('\n').trim());
  }

  return blocks;
}

function hasOptionLikeLines(block: string): boolean {
  const lines = block.split('\n');
  let optionCount = 0;
  for (const line of lines) {
    if (isOptionLine(line.trim())) {
      optionCount++;
    }
  }
  return optionCount >= 2;
}

function isOptionLine(trimmed: string): boolean {
  return (
    /^[-*+]\s*\[[ xX✓✔]\]\s+/.test(trimmed) ||
    /^(?:[-*+]\s*)?(?:\*\*)?(?:[A-Fa-f]|[أابجده])[\.\)\-](?:\*\*)?\s+/.test(trimmed) ||
    /^(?:[-*+]\s*)?\((?:[A-Fa-f]|[أابجده])\)\s+/.test(trimmed)
  );
}

function parseSingleBlock(rawBlock: string, index: number): Question | null {
  const lines = rawBlock.split('\n');

  const promptLines: string[] = [];
  const codeLines: string[] = [];
  const options: string[] = [];
  const explanationLines: string[] = [];
  const optionExplanationsMap = new Map<number, string>();

  let detectedCorrectIndex = -1;
  let explicitAnswerRaw: string | null = null;
  let inCodeFence = false;
  let inExplanation = false;
  let seenFirstOption = false;
  let lastOptionIdx = -1;
  let category: string | undefined;
  let difficulty: 'easy' | 'medium' | 'hard' | undefined;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('```')) {
      inCodeFence = !inCodeFence;
      if (!seenFirstOption && !inExplanation) {
        continue;
      }
    }

    if (inCodeFence) {
      if (!seenFirstOption && !inExplanation) {
        codeLines.push(rawLine);
      } else if (inExplanation) {
        explanationLines.push(rawLine);
      }
      continue;
    }

    if (!trimmed) {
      if (inExplanation && explanationLines.length > 0) {
        explanationLines.push('');
      } else if (!seenFirstOption && promptLines.length > 0) {
        promptLines.push('');
      }
      continue;
    }

    const catMatch = trimmed.match(/^\[Category:\s*([^\]]+)\]/i);
    if (catMatch) {
      category = catMatch[1].trim();
      continue;
    }
    const diffMatch = trimmed.match(/^\[Difficulty:\s*(easy|medium|hard)\]/i);
    if (diffMatch) {
      difficulty = diffMatch[1].toLowerCase() as 'easy' | 'medium' | 'hard';
      continue;
    }

    // Check per-option explanation lines:
    // e.g. `- **Explain A:** ...`, `**Explanation B:** ...`, `- **شرح أ:** ...`
    const perOptionMatch = trimmed.match(
      /^(?:[-*+>]\s*)?(?:\*\*)?(?:Explain|Explanation|Why|Option|شرح|تفسير)\s+([A-Fa-fأابجده])(?:\*\*)?\s*[:\-](?:\*\*)?\s*(.+)$/i
    );
    if (perOptionMatch) {
      const optIdx = letterToIndex(perOptionMatch[1]);
      if (optIdx >= 0) {
        optionExplanationsMap.set(optIdx, perOptionMatch[2].trim());
        inExplanation = false;
        continue;
      }
    }

    // Check sub-bullet or inline `> Explain:` directly beneath an option before Answer/Explanation
    if (seenFirstOption && !inExplanation && lastOptionIdx >= 0 && explicitAnswerRaw === null) {
      const inlineOptExplain = trimmed.match(
        /^(?:[-*+>]\s*)?(?:\*\*)?(?:Explain|Why|Rationale|شرح|تفسير)(?:\*\*)?\s*[:\-](?:\*\*)?\s*(.+)$/i
      );
      if (inlineOptExplain) {
        optionExplanationsMap.set(lastOptionIdx, inlineOptExplain[1].trim());
        continue;
      }
    }

    // Check explicit Answer line (English + Arabic labels)
    const answerMatch = trimmed.match(
      /^(?:>\s*)?(?:\*\*)?(?:Correct\s+Answer|Answer|Correct|Ans|الإجابة\s+الصحيحة|الاجابة\s+الصحيحة|الإجابة|الاجابة|الجواب)(?:\*\*)?\s*[:\-](?:\*\*)?\s*(?:\*\*)?(.+?)(?:\*\*)?$/i
    );
    if (answerMatch) {
      explicitAnswerRaw = answerMatch[1].trim();
      inExplanation = false;
      continue;
    }

    // Check Explanation start line (English + Arabic labels)
    const explanationMatch = trimmed.match(
      /^(?:>\s*)?(?:💡\s*)?(?:\*\*)?(?:Explanation|Why|Rationale|Note|التفسير|الشرح|التوضيح|السبب)(?:\*\*)?\s*[:\-](?:\*\*)?\s*(.*)$/i
    );
    if (explanationMatch) {
      inExplanation = true;
      if (explanationMatch[1].trim()) {
        explanationLines.push(explanationMatch[1].trim());
      }
      continue;
    }

    if (inExplanation) {
      explanationLines.push(rawLine.replace(/^\s*>\s?/, ''));
      continue;
    }

    // Check Checkbox Option: `- [x] Option text` or `- [ ] Option text`
    const checkboxMatch = trimmed.match(/^[-*+]\s*\[([ xX✓✔])\]\s+(.+)$/);
    if (checkboxMatch) {
      seenFirstOption = true;
      const isChecked = /[xX✓✔]/.test(checkboxMatch[1]);
      let optText = checkboxMatch[2].trim();
      optText = optText.replace(/^(?:\*\*)?(?:[A-Fa-f]|[أابجده])[.)](?:\*\*)?\s+/, '');
      if (isChecked) {
        detectedCorrectIndex = options.length;
      }
      lastOptionIdx = options.length;
      options.push(optText);
      continue;
    }

    // Check Lettered Option: `A) text`, `- A) text`, `**A.** text`, `(A) text`, `أ) text`
    const letterMatch = trimmed.match(
      /^(?:[-*+]\s*)?(?:\*\*)?(?:\(([A-Fa-fأابجده])\)|([A-Fa-fأابجده])[.)\-])(?:\*\*)?\s+(.+)$/
    );
    if (letterMatch) {
      seenFirstOption = true;
      let optText = letterMatch[3].trim();
      if (/(?:\(correct\)|\[correct\]|\[x\]|\(صحيح\)|✅|✓|✔)\s*$/i.test(optText)) {
        detectedCorrectIndex = options.length;
        optText = optText
          .replace(/(?:\(correct\)|\[correct\]|\[x\]|\(صحيح\)|✅|✓|✔)\s*$/i, '')
          .trim();
      }
      lastOptionIdx = options.length;
      options.push(optText);
      continue;
    }

    // Check blockquote after options as implicit explanation
    if (seenFirstOption && trimmed.startsWith('>')) {
      inExplanation = true;
      explanationLines.push(trimmed.replace(/^>\s*/, ''));
      continue;
    }

    if (!seenFirstOption) {
      if (promptLines.length === 0) {
        const cleanedHeader = trimmed
          .replace(/^#{1,6}\s*/, '')
          .replace(/^(?:\*\*)?(?:Q(?:uestion)?\s*\d+|س(?:ؤال)?\s*\d+|\d+)[.:)](?:\*\*)?\s*/i, '')
          .trim();
        if (cleanedHeader) {
          promptLines.push(cleanedHeader);
        }
      } else {
        promptLines.push(rawLine.trim());
      }
    }
  }

  if (options.length < 2) {
    return null;
  }

  if (explicitAnswerRaw) {
    const cleanAns = explicitAnswerRaw.replace(/^[\[(]|[\])]$/g, '').trim();
    const letterAnsMatch = cleanAns.match(/^([A-Fa-f])(?:[.)\s]|$)/);
    const arabicAnsMatch = cleanAns.match(/^([أابجده])(?:[.)\s]|$)/);
    if (letterAnsMatch) {
      const idx = letterAnsMatch[1].toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < options.length) {
        detectedCorrectIndex = idx;
      }
    } else if (arabicAnsMatch && ARABIC_LETTER_MAP[arabicAnsMatch[1]] !== undefined) {
      const idx = ARABIC_LETTER_MAP[arabicAnsMatch[1]];
      if (idx >= 0 && idx < options.length) {
        detectedCorrectIndex = idx;
      }
    } else {
      const matchedIdx = options.findIndex(
        (opt) =>
          opt.toLowerCase() === cleanAns.toLowerCase() ||
          opt.toLowerCase().includes(cleanAns.toLowerCase()) ||
          cleanAns.toLowerCase().includes(opt.toLowerCase())
      );
      if (matchedIdx !== -1) {
        detectedCorrectIndex = matchedIdx;
      }
    }
  }

  if (detectedCorrectIndex < 0 || detectedCorrectIndex >= options.length) {
    detectedCorrectIndex = 0;
  }

  const prompt =
    promptLines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() || `Question ${index + 1}`;
  const explanation =
    explanationLines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() ||
    `The correct answer is **${String.fromCharCode(65 + detectedCorrectIndex)}) ${options[detectedCorrectIndex]}**.`;

  let optionExplanations: string[] | undefined;
  if (optionExplanationsMap.size > 0) {
    optionExplanations = options.map((_, oIdx) => {
      const explicit = optionExplanationsMap.get(oIdx);
      if (explicit) return explicit;
      if (oIdx === detectedCorrectIndex) {
        return `Correct choice.`;
      }
      return `Incorrect choice.`;
    });
  }

  return {
    id: `q-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
    prompt,
    codeSnippet: codeLines.length > 0 ? codeLines.join('\n') : undefined,
    options,
    correctIndex: detectedCorrectIndex,
    explanation,
    optionExplanations,
    category,
    difficulty,
  };
}

export function formatQuestionsToMarkdown(questions: Question[]): string {
  return questions
    .map((q, idx) => {
      const lines: string[] = [];
      lines.push(`### ${idx + 1}. ${q.prompt}`);
      if (q.codeSnippet) {
        lines.push('```');
        lines.push(q.codeSnippet);
        lines.push('```');
      }
      q.options.forEach((opt, oIdx) => {
        const letter = String.fromCharCode(65 + oIdx);
        lines.push(`- ${letter}) ${opt}`);
      });
      const correctLetter = String.fromCharCode(65 + q.correctIndex);
      lines.push(`**Answer:** ${correctLetter}`);
      if (q.explanation) {
        lines.push(`**Explanation:** ${q.explanation}`);
      }
      if (q.optionExplanations && q.optionExplanations.length > 0) {
        q.optionExplanations.forEach((exp, oIdx) => {
          const letter = String.fromCharCode(65 + oIdx);
          lines.push(`- **Explain ${letter}:** ${exp}`);
        });
      }
      return lines.join('\n');
    })
    .join('\n\n---\n\n');
}
