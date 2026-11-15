import { ParseQuestionsResult, Question } from '@/types/exam';

export const MARKDOWN_FORMAT_GUIDE = `# Sample Exam Title

### 1. What is the time complexity of looking up a key in a Hash Map (average case)?
- A) O(n)
- B) O(log n)
- C) O(1)
- D) O(n log n)
**Answer:** C
**Explanation:** Hash maps compute a hash index directly from the key, giving **O(1)** constant-time lookup on average (assuming minimal hash collisions).

---

### 2. Which HTTP status code indicates that the client is being rate-limited?
- [ ] 401 Unauthorized
- [ ] 403 Forbidden
- [x] 429 Too Many Requests
- [ ] 503 Service Unavailable
> **Explanation:** HTTP **429 Too Many Requests** indicates the user has sent too many requests in a given amount of time ("rate limiting").`;

/**
 * Deterministic, flexible Markdown Question Parser.
 * Supports:
 * - Question headers (`### 1. Question`, `## Q1:`, `1. Question`, or `---` dividers)
 * - Lettered options (`A) ...`, `A. ...`, `- A) ...`, `- **A.** ...`)
 * - Checkbox options (`- [x] ...`, `- [ ] ...`)
 * - Answer declarations (`**Answer:** B`, `Answer: C`, `Correct: A`, or inline `[x]` / `✓`)
 * - Explanation blocks (`**Explanation:** ...`, `> Explanation: ...`, `Why: ...`)
 * - Fenced code blocks (` ```ts ... ``` `)
 */
export function parseMarkdownQuestions(markdown: string): ParseQuestionsResult {
  const warnings: string[] = [];
  const normalized = markdown.replace(/\r\n/g, '\n').trim();

  if (!normalized) {
    return { questions: [], source: 'markdown', warnings: ['Empty markdown input.'] };
  }

  // Split into raw candidate question blocks
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
      'Could not detect structured questions with options. Make sure each question has at least 2 options (e.g., A), B), C), D) or - [ ] / - [x]).'
    );
  }

  return {
    questions,
    source: 'markdown',
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function splitIntoQuestionBlocks(markdown: string): string[] {
  // Remove top-level single H1 document title if followed by content
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

  // First try splitting by horizontal rules `---` outside code blocks
  const hrBlocks = splitByOutsideCode(body, /^---+$/m);
  if (hrBlocks.length > 1) {
    // Further split any hrBlock that contains multiple headers
    return hrBlocks.flatMap((b) => splitByQuestionHeaders(b));
  }

  return splitByQuestionHeaders(body);
}

function splitByOutsideCode(text: string, delimiterRegex: RegExp): string[] {
  const lines = text.split('\n');
  const chunks: string[] = [];
  let current: string[] = [];
  let inCode = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCode = !inCode;
    }
    if (!inCode && delimiterRegex.test(line.trim())) {
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
    /^(?:#{2,4}\s*(?:Q(?:uestion)?\s*\d*[:.)]?\s*|\d+[:.)]\s*)?|(?:Q(?:uestion)?\s*\d+[:.)]\s*)|\*\*(?:Q(?:uestion)?\s*\d+|\d+)[.:)]\*\*|\d+[.)]\s+(?=[A-ZWhat|Which|How|Why|When|Where|Who|In|If|Given|Consider|Select]))/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCode = !inCode;
    }

    // Do not split on numbered options like `1) foo` if not preceded by blank line or if current has no options yet
    const isHeader =
      !inCode &&
      headerPattern.test(trimmed) &&
      !/^[-*]\s/.test(trimmed) &&
      !/^[A-Da-d][.)]\s/.test(trimmed);

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
    /^(?:[-*+]\s*)?(?:\*\*)?[A-Fa-f][.)](?:\*\*)?\s+/.test(trimmed) ||
    /^(?:[-*+]\s*)?\([A-Fa-f]\)\s+/.test(trimmed)
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
      }
      continue;
    }

    // Check metadata tags e.g. [Category: Cardiology] [Difficulty: Hard]
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

    // Check explicit Answer line
    const answerMatch = trimmed.match(
      /^(?:>\s*)?(?:\*\*|__)?(?:Correct\s+Answer|Answer|Correct|Ans)(?:\*\*|__)?\s*[:\-](?:\*\*|__)?\s*(?:\*\*|__)?(.+?)(?:\*\*|__)?$/i
    );
    if (answerMatch) {
      explicitAnswerRaw = answerMatch[1].trim();
      inExplanation = false;
      continue;
    }

    // Check Explanation start line
    const explanationMatch = trimmed.match(
      /^(?:>\s*)?(?:💡\s*)?(?:\*\*|__)?(?:Explanation|Why|Rationale|Note)(?:\*\*|__)?\s*[:\-](?:\*\*|__)?\s*(.*)$/i
    );
    if (explanationMatch) {
      inExplanation = true;
      if (explanationMatch[1].trim()) {
        explanationLines.push(explanationMatch[1].trim());
      }
      continue;
    }

    if (inExplanation) {
      explanationLines.push(trimmed.replace(/^>\s*/, ''));
      continue;
    }

    // Check Checkbox Option: `- [x] Option text` or `- [ ] Option text`
    const checkboxMatch = trimmed.match(/^[-*+]\s*\[([ xX✓✔])\]\s+(.+)$/);
    if (checkboxMatch) {
      seenFirstOption = true;
      const isChecked = /[xX✓✔]/.test(checkboxMatch[1]);
      let optText = checkboxMatch[2].trim();
      // Strip leading A) or B. inside checkbox if present
      optText = optText.replace(/^(?:\*\*)?[A-Fa-f][.)](?:\*\*)?\s+/, '');
      if (isChecked) {
        detectedCorrectIndex = options.length;
      }
      options.push(optText);
      continue;
    }

    // Check Lettered Option: `A) text`, `- A) text`, `**A.** text`, `(A) text`
    const letterMatch = trimmed.match(
      /^(?:[-*+]\s*)?(?:\*\*|__)?(?:\(([A-Fa-f])\)|([A-Fa-f])[.)])(?:\*\*|__)?\s+(.+)$/
    );
    if (letterMatch) {
      seenFirstOption = true;
      let optText = letterMatch[3].trim();
      // Check if option ends with `(correct)` or `✓` or `[x]`
      if (/(?:\(correct\)|\[correct\]|\[x\]|✅|✓|✔)\s*$/i.test(optText)) {
        detectedCorrectIndex = options.length;
        optText = optText
          .replace(/(?:\(correct\)|\[correct\]|\[x\]|✅|✓|✔)\s*$/i, '')
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
      // Clean question header prefix on first prompt line
      if (promptLines.length === 0) {
        const cleanedHeader = trimmed
          .replace(/^#{1,6}\s*/, '')
          .replace(/^(?:\*\*)?(?:Q(?:uestion)?\s*\d+|\d+)[.:)](?:\*\*)?\s*/i, '')
          .trim();
        if (cleanedHeader) {
          promptLines.push(cleanedHeader);
        }
      } else {
        promptLines.push(trimmed);
      }
    }
  }

  if (options.length < 2) {
    return null;
  }

  // Resolve explicitAnswerRaw if present
  if (explicitAnswerRaw) {
    const cleanAns = explicitAnswerRaw.replace(/^[\[(]|[\])]$/g, '').trim();
    // Single letter A-F or letter followed by ) or .
    const letterAnsMatch = cleanAns.match(/^([A-Fa-f])(?:[.)\s]|$)/);
    if (letterAnsMatch) {
      const idx = letterAnsMatch[1].toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < options.length) {
        detectedCorrectIndex = idx;
      }
    } else {
      // Try matching by option text
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

  const prompt = promptLines.join(' ').trim() || `Question ${index + 1}`;
  const explanation =
    explanationLines.join('\n').trim() ||
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
