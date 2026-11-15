import { NextRequest, NextResponse } from 'next/server';
import { parseMarkdownQuestions } from '@/lib/markdown-parser';
import {
  ParseQuestionsResult,
  Question,
  QuestionAttachment,
} from '@/types/exam';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const markdown = String(body.markdown || '').trim();
    const attachments: QuestionAttachment[] = Array.isArray(body.attachments)
      ? body.attachments.filter(
          (a: unknown): a is QuestionAttachment =>
            Boolean(
              a &&
                typeof a === 'object' &&
                typeof (a as QuestionAttachment).mimeType === 'string' &&
                typeof (a as QuestionAttachment).base64Data === 'string' &&
                (a as QuestionAttachment).base64Data.length > 0
            )
        )
      : [];

    const hasAttachments = attachments.length > 0;
    const useGemini = Boolean(body.useGemini) || hasAttachments;
    const apiKey =
      (typeof body.apiKey === 'string' && body.apiKey.trim()) ||
      process.env.GEMINI_API_KEY ||
      '';

    if (!markdown && !hasAttachments) {
      return NextResponse.json(
        {
          error:
            'Please paste Markdown questions or upload a PDF / image / .md file first.',
        },
        { status: 400 }
      );
    }

    const deterministicResult = markdown
      ? parseMarkdownQuestions(markdown)
      : { questions: [], source: 'markdown' as const };

    if (!useGemini || !apiKey) {
      if (hasAttachments && !apiKey) {
        if (deterministicResult.questions.length > 0) {
          return NextResponse.json({
            ...deterministicResult,
            warnings: [
              ...(deterministicResult.warnings || []),
              'A Gemini API key is required to parse PDF or image attachments. Parsed the text portion only.',
            ],
          } satisfies ParseQuestionsResult);
        }
        return NextResponse.json(
          {
            error:
              'Extracting questions from PDFs or images requires a Gemini API key. Paste your free Gemini API key in the studio settings!',
          },
          { status: 400 }
        );
      }

      if (useGemini && !apiKey && deterministicResult.questions.length > 0) {
        return NextResponse.json({
          ...deterministicResult,
          warnings: [
            ...(deterministicResult.warnings || []),
            'No Gemini API key provided — parsed using built-in Markdown & LaTeX engine.',
          ],
        } satisfies ParseQuestionsResult);
      }

      return NextResponse.json(deterministicResult satisfies ParseQuestionsResult);
    }

    // Call Gemini 2.5 Flash multimodal REST API (supports PDFs, images, and text/Markdown)
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
        apiKey
      )}`;

      const promptText = `You are an expert exam question parser and academic assessment designer.
Analyze the provided input (PDF documents, images of exam papers/slides, or Markdown/study notes):
1. Extract all multiple-choice questions, options, correct answers, and explanations. If the input consists of raw study notes or slides without explicit questions, generate high-yield multiple-choice questions testing the core concepts.
2. MATH & SCIENCE FORMATTING (CRITICAL): Format ALL mathematical equations, formulas, fractions, exponents, subscripts, integrals, vectors, Greek symbols, and physics/chemistry notation using clean LaTeX:
   - Use $...$ for inline math (e.g. $E_k = \\frac{1}{2}mv^2$, $O(n \\log n)$, $\\int_0^1 x^2 \\, dx$).
   - Use $$...$$ for standalone display equations.
3. LANGUAGE PRESERVATION: Preserve the exact language of the source material (e.g., if the input is in Arabic, keep prompts, options, and explanations in Arabic while keeping LaTeX math expressions inside $...$; if English, keep in English).

Return ONLY a valid JSON array of question objects, where each object has:
- "prompt": string (the question text, with LaTeX in $...$ or $$...$$)
- "codeSnippet": string | optional (any programming code block belonging to the question, without backticks)
- "options": string[] (array of 4 option strings, WITHOUT leading A)/B)/C)/D) prefixes, with any math in $...$)
- "correctIndex": number (0-based index of the correct option, from 0 to options.length - 1)
- "explanation": string (clear, high-yield explanation of why the correct answer is right and why other options are wrong, with any math in $...$)
- "category": string | optional
- "difficulty": "easy" | "medium" | "hard"
${markdown ? `\nAdditional Markdown / Text Input:\n${markdown}` : ''}`;

      const parts: Array<Record<string, unknown>> = [];

      for (const att of attachments) {
        const cleanBase64 = att.base64Data.replace(
          /^data:[^;]+;base64,/,
          ''
        );
        parts.push({
          inlineData: {
            mimeType: att.mimeType,
            data: cleanBase64,
          },
        });
      }

      parts.push({ text: promptText });

      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(
          `Gemini API error (${response.status})${
            errText ? `: ${errText.slice(0, 120)}` : ''
          }`
        );
      }

      const data = await response.json();
      const rawJsonText =
        data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      const parsedArray = JSON.parse(rawJsonText);

      if (Array.isArray(parsedArray) && parsedArray.length > 0) {
        const questions: Question[] = parsedArray
          .filter(
            (item) =>
              item &&
              typeof item.prompt === 'string' &&
              Array.isArray(item.options) &&
              item.options.length >= 2
          )
          .map((item, idx) => {
            const opts = item.options.map((o: unknown) =>
              String(o)
                .replace(/^(?:[A-Fa-fأابجده][.)\-]|\([A-Fa-fأابجده]\))\s+/, '')
                .trim()
            );
            const cIdx = Number(item.correctIndex);
            const safeCorrect =
              Number.isFinite(cIdx) && cIdx >= 0 && cIdx < opts.length
                ? cIdx
                : 0;
            return {
              id: `gem-q-${idx + 1}-${Math.random().toString(36).slice(2, 7)}`,
              prompt: item.prompt.trim(),
              codeSnippet:
                typeof item.codeSnippet === 'string' && item.codeSnippet.trim()
                  ? item.codeSnippet.trim()
                  : undefined,
              options: opts,
              correctIndex: safeCorrect,
              explanation:
                typeof item.explanation === 'string' && item.explanation.trim()
                  ? item.explanation.trim()
                  : `Correct answer: ${opts[safeCorrect]}`,
              category:
                typeof item.category === 'string' ? item.category : undefined,
              difficulty:
                item.difficulty === 'easy' ||
                item.difficulty === 'medium' ||
                item.difficulty === 'hard'
                  ? item.difficulty
                  : undefined,
            };
          });

        if (questions.length > 0) {
          return NextResponse.json({
            questions,
            source: 'gemini',
          } satisfies ParseQuestionsResult);
        }
      }
    } catch (geminiErr) {
      if (deterministicResult.questions.length > 0) {
        return NextResponse.json({
          ...deterministicResult,
          warnings: [
            ...(deterministicResult.warnings || []),
            `Gemini fallback used (${
              geminiErr instanceof Error ? geminiErr.message : 'API error'
            }).`,
          ],
        } satisfies ParseQuestionsResult);
      }
      return NextResponse.json(
        {
          error:
            geminiErr instanceof Error
              ? geminiErr.message
              : 'Gemini AI failed to parse the uploaded document.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json(deterministicResult satisfies ParseQuestionsResult);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to parse questions.',
      },
      { status: 500 }
    );
  }
}
