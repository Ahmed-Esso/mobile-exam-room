import { NextRequest, NextResponse } from 'next/server';
import { parseMarkdownQuestions } from '@/lib/markdown-parser';
import { ParseQuestionsResult, Question } from '@/types/exam';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const markdown = String(body.markdown || '').trim();
    const useGemini = Boolean(body.useGemini);
    const apiKey =
      (typeof body.apiKey === 'string' && body.apiKey.trim()) ||
      process.env.GEMINI_API_KEY ||
      '';

    if (!markdown) {
      return NextResponse.json(
        { error: 'Please paste or upload Markdown questions first.' },
        { status: 400 }
      );
    }

    // First run deterministic Markdown parser
    const deterministicResult = parseMarkdownQuestions(markdown);

    // If user didn't request Gemini or no API key is available, return deterministic result
    if (!useGemini || !apiKey) {
      if (useGemini && !apiKey && deterministicResult.questions.length > 0) {
        return NextResponse.json({
          ...deterministicResult,
          warnings: [
            ...(deterministicResult.warnings || []),
            'No Gemini API key provided — parsed using built-in Markdown engine.',
          ],
        } satisfies ParseQuestionsResult);
      }
      return NextResponse.json(deterministicResult satisfies ParseQuestionsResult);
    }

    // Call Gemini 2.5 Flash REST API for intelligent parsing of structured or unstructured notes
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
        apiKey
      )}`;

      const prompt = `Extract or generate multiple-choice exam questions from the following Markdown or study notes.
Return a JSON array of objects, where each object has:
- "prompt": string (the question text)
- "codeSnippet": string | optional (any code block belonging to the question, without backticks)
- "options": string[] (array of 4 option strings, without leading A)/B)/C)/D) prefixes)
- "correctIndex": number (0-based index of the correct option, 0 to options.length-1)
- "explanation": string (clear, high-yield explanation of why the correct answer is right and others are wrong)
- "category": string | optional
- "difficulty": "easy" | "medium" | "hard"

Input Markdown / Notes:
${markdown}`;

      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Gemini API responded with status ${response.status}`);
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
              String(o).replace(/^(?:[A-Fa-f][.)]|\([A-Fa-f]\))\s+/, '').trim()
            );
            const cIdx = Number(item.correctIndex);
            const safeCorrect =
              Number.isFinite(cIdx) && cIdx >= 0 && cIdx < opts.length ? cIdx : 0;
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
      // Fallback gracefully to deterministic parser
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
