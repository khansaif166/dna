import type { APIRoute } from 'astro';
import { desc, eq } from 'drizzle-orm';
import { PDFParse } from 'pdf-parse';
import { z } from 'zod';

import { db, questions } from '../../../../db';
import { hasValidOrigin } from '../../../../lib/csrf';
import { parseQuestionsFromPdfText } from '../../../../lib/questionPdf';
import { requireAdminApi } from '../../../../lib/requireAdminApi';

export const prerender = false;

const uploadSchema = z.object({
  testId: z.string().uuid(),
  file: z.instanceof(File),
});

function json(message: string, status: number, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ message, ...extra }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
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
    file: formData.get('pdf'),
  });

  if (!parsedUpload.success) {
    return json('Please choose a PDF file to import.', 400);
  }

  const { testId, file } = parsedUpload.data;

  if (file.size === 0) {
    return json('The uploaded PDF is empty.', 400);
  }

  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return json('Only PDF uploads are supported.', 400);
  }

  let parser: PDFParse | null = null;

  try {
    const pdfData = new Uint8Array(await file.arrayBuffer());
    parser = new PDFParse({ data: pdfData });

    const result = await parser.getText();
    const parsedResult = parseQuestionsFromPdfText(result.text);
    const { questions: parsedQuestions, skipped } = parsedResult;

    const existingQuestions = await db
      .select({ order: questions.order })
      .from(questions)
      .where(eq(questions.testId, testId))
      .orderBy(desc(questions.order))
      .limit(1);

    const startingOrder = existingQuestions[0]?.order ?? 0;

    await db.insert(questions).values(
      parsedQuestions.map((question, index) => ({
        testId,
        prompt: question.prompt,
        optionA: question.optionA,
        optionB: question.optionB,
        optionC: question.optionC,
        optionD: question.optionD,
        correctOption: question.correctOption,
        explanation: question.explanation,
        order: startingOrder + index + 1,
      }))
    );

    const summaryMessage = skipped.length
      ? `Imported ${parsedQuestions.length} questions from ${file.name}. Skipped ${skipped.length} unsupported questions.`
      : `Imported ${parsedQuestions.length} questions from ${file.name}.`;

    return json(summaryMessage, 200, {
      importedCount: parsedQuestions.length,
      skipped,
      sourceFileName: file.name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import questions from the PDF.';
    return json(message, 400);
  } finally {
    await parser?.destroy();
  }
};

export const ALL: APIRoute = async () =>
  new Response(null, {
    status: 405,
    headers: { Allow: 'POST' },
  });
