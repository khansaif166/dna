import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db, questions } from '../../../../db';
import { hasValidOrigin } from '../../../../lib/csrf';
import { loadPdfParse } from '../../../../lib/pdfRuntime';
import { parseAnswerKeyEntriesFromText } from '../../../../lib/questionPdf';
import { requireAdminApi } from '../../../../lib/requireAdminApi';

export const prerender = false;

const uploadSchema = z.object({
  testId: z.string().uuid(),
  file: z.instanceof(File).optional(),
  answerKeyText: z.string().optional(),
});

function json(message: string, status: number, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ message, ...extra }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

async function readAnswerKeyText(file: File | undefined, answerKeyText: string | undefined) {
  if (answerKeyText?.trim()) {
    return answerKeyText.trim();
  }

  if (!file || file.size === 0) {
    throw new Error('Upload an answer-key file or paste answer-key text.');
  }

  if (file.name.toLowerCase().endsWith('.pdf')) {
    const { PDFParse } = await loadPdfParse();
    const parser = new PDFParse({ data: new Uint8Array(await file.arrayBuffer()) });

    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  return await file.text();
}

export const POST: APIRoute = async (context) => {
  if (!hasValidOrigin(context.request)) {
    return json('Forbidden', 403);
  }

  const auth = await requireAdminApi(context);

  if (auth instanceof Response) {
    return auth;
  }

  const formData = await context.request.formData();
  const parsedUpload = uploadSchema.safeParse({
    testId: formData.get('test_id'),
    file: formData.get('answer_key_file') instanceof File ? formData.get('answer_key_file') : undefined,
    answerKeyText: typeof formData.get('answer_key_text') === 'string' ? formData.get('answer_key_text') : undefined,
  });

  if (!parsedUpload.success) {
    return json('Provide a valid test and answer-key input.', 400);
  }

  try {
    const answerKeyText = await readAnswerKeyText(parsedUpload.data.file, parsedUpload.data.answerKeyText);
    const entries = parseAnswerKeyEntriesFromText(answerKeyText);

    if (!entries.length) {
      throw new Error('No answer-key entries were detected. Use lines like "1. (2)" or "1 B".');
    }

    const testQuestions = await db
      .select({
        id: questions.id,
        order: questions.order,
      })
      .from(questions)
      .where(eq(questions.testId, parsedUpload.data.testId))
      .orderBy(questions.order);

    if (!testQuestions.length) {
      throw new Error('This test has no questions yet. Import questions before importing the answer key.');
    }

    const questionsByOrder = new Map(testQuestions.map((question) => [question.order, question]));
    const unmatchedEntries: Array<{ questionNumber: number; reason: string }> = [];
    let updatedCount = 0;

    await db.transaction(async (tx) => {
      for (const entry of entries) {
        const matchedQuestion = questionsByOrder.get(entry.questionNumber);

        if (!matchedQuestion) {
          unmatchedEntries.push({
            questionNumber: entry.questionNumber,
            reason: 'No imported question exists for this question number.',
          });
          continue;
        }

        await tx
          .update(questions)
          .set({
            correctOption: entry.correctOption,
          })
          .where(eq(questions.id, matchedQuestion.id));

        updatedCount += 1;
      }
    });

    return json(
      `Imported answer keys for ${updatedCount} question${updatedCount === 1 ? '' : 's'}.${
        unmatchedEntries.length ? ` ${unmatchedEntries.length} entries could not be matched.` : ''
      }`,
      200,
      {
        updatedCount,
        unmatchedEntries,
      }
    );
  } catch (error) {
    return json(error instanceof Error ? error.message : 'Failed to import answer key.', 400);
  }
};

export const ALL: APIRoute = async () =>
  new Response(null, {
    status: 405,
    headers: { Allow: 'POST' },
  });
