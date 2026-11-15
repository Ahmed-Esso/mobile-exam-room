import { ParseQuestionsResult, Question } from '@/types/exam';

export const MARKDOWN_FORMAT_GUIDE = `# Sample Format (Supports Markdown & LaTeX Math)

### 1. What is the kinetic energy of a particle with mass $m$ and velocity $v$?
- A) $E_k = mv$
- B) $E_k = \\frac{1}{2}mv^2$
- C) $E_k = mc^2$
- D) $E_k = mgh$
**Answer:** B
**Explanation:** Classical kinetic energy is given by $$E_k = \\frac{1}{2}mv^2$$ derived from integrating work $W = \\int F \\, dx = \\int m v \\, dv$.

---

### 2. Which HTTP status code indicates that the client is being rate-limited?
- [ ] 401 Unauthorized
- [ ] 403 Forbidden
- [x] 429 Too Many Requests
- [ ] 503 Service Unavailable
> **Explanation:** HTTP **429 Too Many Requests** indicates the user has sent too many requests in a given time window.`;

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

/**
 * Deterministic, flexible Markdown Question Parser with full LaTeX ($...$, $$...$$, \(...\), \[...\])
 * and bilingual (English + Arabic) support.
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

  let detectedCorrectIndex = -1;
  let explicitAnswerRaw: string | null = null;
  let inCodeFence = false;
  let inExplanation = false;
  let seenFirstOption = false;
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

    // Check explicit Answer line (English + Arabic labels, preserving LaTeX underscores/backslashes)
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

  return {
    id: `q-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
    prompt,
    codeSnippet: codeLines.length > 0 ? codeLines.join('\n') : undefined,
    options,
    correctIndex: detectedCorrectIndex,
    explanation,
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
      return lines.join('\n');
    })
    .join('\n\n---\n\n');
}
