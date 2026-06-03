import type { APIRoute } from 'astro';
import { desc, eq } from 'drizzle-orm';
import type { EmbeddedImage, PageImages } from 'pdf-parse';
import { PDFParse } from 'pdf-parse';
import { OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { db, questions } from '../../../../db';
import { hasValidOrigin } from '../../../../lib/csrf';
import {
  ensureQuestionImageBucketExists,
  QUESTION_IMAGE_BUCKET,
  sanitizeQuestionImageFileName,
} from '../../../../lib/questionImages';
import { parseQuestionsFromPdfText } from '../../../../lib/questionPdf';
import { requireAdminApi } from '../../../../lib/requireAdminApi';

export const prerender = false;

const uploadSchema = z.object({
  testId: z.string().uuid(),
  file: z.instanceof(File),
});

const IMAGE_THRESHOLD = 80;
const QUESTION_LINE_TOLERANCE = 3;
const DECORATIVE_IMAGE_MAX_PAGE_WIDTH_RATIO = 0.82;
const DECORATIVE_IMAGE_MAX_PAGE_HEIGHT_RATIO = 0.5;

type PdfLine = {
  pageNumber: number;
  text: string;
  y: number;
};

type PdfQuestionBlock = {
  questionNumber: number;
  pageNumber: number;
  pageWidth: number;
  startX: number;
  startY: number;
  nextStartY: number;
  firstOptionY: number | null;
  columnKey: 'left' | 'right';
};

type PositionedEmbeddedImage = {
  pageNumber: number;
  image: EmbeddedImage;
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
  area: number;
  centerX: number;
  centerY: number;
};

type LoadedPdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<{
    view: number[];
    getTextContent: () => Promise<{
      items: Array<unknown>;
    }>;
    getOperatorList: () => Promise<{
      fnArray: number[];
      argsArray: Array<any[]>;
    }>;
  }>;
};

function json(message: string, status: number, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ message, ...extra }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function getFriendlyImportErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Failed to import questions from the PDF.';

  if (
    message.includes('null value in column "correct_option"') ||
    message.includes('questions_correct_option_not_null') ||
    message.includes('"correct_option"')
  ) {
    return 'Your database still requires a correct answer for every question. Apply the latest migration to allow PDF imports without an answer key, then retry.';
  }

  return message;
}

function getImageMimeType(image: EmbeddedImage) {
  const dataUrlMatch = image.dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,/i);
  return dataUrlMatch?.[1]?.toLowerCase() ?? 'image/png';
}

function getImageExtension(mimeType: string) {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'png';
  }
}

function toUploadArrayBuffer(data: Uint8Array) {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

function normalizeLineText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function getColumnKey(x: number, pageWidth: number) {
  return x < pageWidth / 2 ? 'left' : 'right';
}

function buildPdfLines(textItems: Array<{ str: string; transform: number[]; width: number }>) {
  const sortedItems = [...textItems].sort((left, right) => {
    const yDiff = right.transform[5] - left.transform[5];

    if (Math.abs(yDiff) > QUESTION_LINE_TOLERANCE) {
      return yDiff;
    }

    return left.transform[4] - right.transform[4];
  });

  const lines: PdfLine[] = [];
  let current: { parts: string[]; y: number; right: number } | null = null;

  for (const item of sortedItems) {
    const text = item.str;

    if (!text.trim()) {
      continue;
    }

    const x = item.transform[4];
    const y = item.transform[5];

    if (!current || Math.abs(current.y - y) > QUESTION_LINE_TOLERANCE) {
      if (current) {
        lines.push({
          pageNumber: 0,
          text: normalizeLineText(current.parts.join('')),
          y: current.y,
        });
      }

      current = {
        parts: [text],
        y,
        right: x + item.width,
      };
      continue;
    }

    if (x - current.right > 2 && !current.parts.at(-1)?.endsWith(' ')) {
      current.parts.push(' ');
    }

    current.parts.push(text);
    current.right = Math.max(current.right, x + item.width);
  }

  if (current) {
    lines.push({
      pageNumber: 0,
      text: normalizeLineText(current.parts.join('')),
      y: current.y,
    });
  }

  return lines.filter((line) => line.text);
}

async function extractQuestionBlocks(document: LoadedPdfDocument) {
  const questionBlocks: PdfQuestionBlock[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageWidth = page.view[2] - page.view[0];
    const textItems = textContent.items.filter(
      (item): item is { str: string; transform: number[]; width: number } => 'str' in item
    );
    const starts = textItems
      .map((item) => {
        const text = item.str.trim();
        const match = text.match(/^(\d+)\.$/);

        return match
          ? {
              questionNumber: Number(match[1]),
              pageNumber,
              startX: item.transform[4],
              startY: item.transform[5],
              columnKey: getColumnKey(item.transform[4], pageWidth),
            }
          : null;
      })
      .filter(
        (
          line
        ): line is {
          questionNumber: number;
          pageNumber: number;
          startX: number;
          startY: number;
          columnKey: 'left' | 'right';
        } => Boolean(line)
      );

    const optionMarkers = textItems
      .map((item) => ({
        text: item.str.trim(),
        x: item.transform[4],
        y: item.transform[5],
        columnKey: getColumnKey(item.transform[4], pageWidth),
      }))
      .filter((item) => item.text === '(1)');

    for (const columnKey of ['left', 'right'] as const) {
      const columnStarts = starts
        .filter((start) => start.columnKey === columnKey)
        .sort((left, right) => right.startY - left.startY);

      for (let index = 0; index < columnStarts.length; index += 1) {
        const current = columnStarts[index];
        const nextStartY = columnStarts[index + 1]?.startY ?? 0;
        const firstOptionY =
          optionMarkers.find(
            (marker) => marker.columnKey === columnKey && marker.y < current.startY && marker.y > nextStartY
          )?.y ?? null;

        questionBlocks.push({
          questionNumber: current.questionNumber,
          pageNumber,
          pageWidth,
          startX: current.startX,
          startY: current.startY,
          nextStartY,
          firstOptionY,
          columnKey,
        });
      }
    }
  }

  return questionBlocks;
}

function getImageBounds(transformMatrix: number[]) {
  const corners = [
    Util.applyTransform([0, 0], transformMatrix),
    Util.applyTransform([1, 0], transformMatrix),
    Util.applyTransform([0, 1], transformMatrix),
    Util.applyTransform([1, 1], transformMatrix),
  ];
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const bottom = Math.min(...ys);
  const top = Math.max(...ys);

  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: top - bottom,
    area: Math.max(0, right - left) * Math.max(0, top - bottom),
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

async function extractPdfImagesByPage(parser: PDFParse, document: LoadedPdfDocument, totalPages: number) {
  const pages: PageImages[] = [];
  const skippedImagePages: Array<{ pageNumber: number; reason: string }> = [];
  const positionedImages: PositionedEmbeddedImage[] = [];

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    try {
      const page = await document.getPage(pageNumber);
      const pageWidth = page.view[2] - page.view[0];
      const pageHeight = page.view[3] - page.view[1];
      const ops = await page.getOperatorList();
      let transformMatrix = [1, 0, 0, 1, 0, 0];
      const transformStack: number[][] = [];
      const imagePlacements: Array<Omit<PositionedEmbeddedImage, 'image'>> = [];

      for (let index = 0; index < ops.fnArray.length; index += 1) {
        const fn = ops.fnArray[index];
        const args = ops.argsArray[index];

        if (fn === OPS.save) {
          transformStack.push([...transformMatrix]);
          continue;
        }

        if (fn === OPS.restore) {
          transformMatrix = transformStack.pop() ?? [1, 0, 0, 1, 0, 0];
          continue;
        }

        if (fn === OPS.transform) {
          transformMatrix = Util.transform(transformMatrix, args);
          continue;
        }

        if (fn !== OPS.paintImageXObject && fn !== OPS.paintInlineImageXObject) {
          continue;
        }

        const intrinsicWidth = Number(args?.[1] ?? 0);
        const intrinsicHeight = Number(args?.[2] ?? 0);

        if (IMAGE_THRESHOLD >= intrinsicWidth || IMAGE_THRESHOLD >= intrinsicHeight) {
          continue;
        }

        const bounds = getImageBounds(transformMatrix);
        const widthRatio = pageWidth ? bounds.width / pageWidth : 0;
        const heightRatio = pageHeight ? bounds.height / pageHeight : 0;

        if (
          widthRatio >= DECORATIVE_IMAGE_MAX_PAGE_WIDTH_RATIO ||
          heightRatio >= DECORATIVE_IMAGE_MAX_PAGE_HEIGHT_RATIO
        ) {
          continue;
        }

        imagePlacements.push({
          pageNumber,
          ...bounds,
        });
      }

      const imageResult = await parser.getImage({
        partial: [pageNumber],
        imageDataUrl: true,
        imageBuffer: true,
        imageThreshold: IMAGE_THRESHOLD,
      });

      const pageImages =
        imageResult.pages[0] ?? {
          pageNumber,
          images: [],
        };

      pages.push(pageImages);

      const pairCount = Math.min(pageImages.images.length, imagePlacements.length);

      for (let index = 0; index < pairCount; index += 1) {
        positionedImages.push({
          ...imagePlacements[index],
          image: pageImages.images[index],
        });
      }
    } catch (error) {
      skippedImagePages.push({
        pageNumber,
        reason: error instanceof Error ? error.message : 'Failed to extract images from this page.',
      });
      pages.push({
        pageNumber,
        images: [],
      });
    }
  }

  return { pages, skippedImagePages, positionedImages };
}

async function uploadImportedQuestionImage(
  supabase: SupabaseClient,
  testId: string,
  questionOrder: number,
  pageNumber: number,
  image: EmbeddedImage
) {
  const mimeType = getImageMimeType(image);
  const extension = getImageExtension(mimeType);
  const safeName = sanitizeQuestionImageFileName(`pdf-q${questionOrder}-p${pageNumber}-${image.name}.${extension}`);
  const objectPath = `tests/${testId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(QUESTION_IMAGE_BUCKET)
    .upload(objectPath, toUploadArrayBuffer(image.data), {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message || 'Failed to upload PDF image.');
  }

  const { data } = supabase.storage.from(QUESTION_IMAGE_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

function assignQuestionBoundImages(
  parsedQuestions: ReturnType<typeof parseQuestionsFromPdfText>['questions'],
  questionBlocks: PdfQuestionBlock[],
  positionedImages: PositionedEmbeddedImage[]
) {
  return parsedQuestions.map((question) => {
    if (!question.sourcePageNumber || !question.sourceQuestionNumber) {
      return { ...question, extractedImage: null as EmbeddedImage | null };
    }

    const questionBlock = questionBlocks.find(
      (block) =>
        block.pageNumber === question.sourcePageNumber && block.questionNumber === question.sourceQuestionNumber
    );

    if (!questionBlock) {
      return { ...question, extractedImage: null as EmbeddedImage | null };
    }

    const candidates = positionedImages
      .filter((image) => {
        if (image.pageNumber !== questionBlock.pageNumber) {
          return false;
        }

        if (getColumnKey(image.centerX, questionBlock.pageWidth) !== questionBlock.columnKey) {
          return false;
        }

        if (image.centerY >= questionBlock.startY || image.centerY <= questionBlock.nextStartY) {
          return false;
        }

        if (questionBlock.firstOptionY !== null && image.centerY <= questionBlock.firstOptionY) {
          return false;
        }

        return true;
      })
      .sort((left, right) => right.area - left.area);

    return {
      ...question,
      extractedImage: candidates[0]?.image ?? null,
    };
  });
}

function buildImageMatchWarnings(
  parsedQuestions: ReturnType<typeof parseQuestionsFromPdfText>['questions'],
  questionsWithImages: Array<(typeof parsedQuestions)[number] & { extractedImage: EmbeddedImage | null }>
) {
  const matchedImageCount = questionsWithImages.filter((question) => question.extractedImage).length;
  const unmatchedQuestions = questionsWithImages.filter(
    (question) => question.sourcePageNumber !== null && !question.extractedImage
  ).length;

  if (matchedImageCount === 0 || unmatchedQuestions === 0) {
    return [];
  }

  return [
    {
      reason: 'Only images positioned inside a specific question block were attached. Decorative or ambiguous page images were ignored.',
      matchedImageCount,
      unmatchedQuestions,
    },
  ];
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
    const document = await (parser as unknown as { load: () => Promise<LoadedPdfDocument> }).load();

    const textResult = await parser.getText();
    const { pages: imagePages, skippedImagePages, positionedImages } = await extractPdfImagesByPage(parser, document, textResult.pages.length);
    const questionBlocks = await extractQuestionBlocks(document);
    const parsedResult = parseQuestionsFromPdfText(textResult.text, textResult.pages);
    const { questions: parsedQuestions, skipped } = parsedResult;
    const questionsWithImages = assignQuestionBoundImages(parsedQuestions, questionBlocks, positionedImages);
    const imageMatchWarnings = buildImageMatchWarnings(parsedQuestions, questionsWithImages);
    const { supabase, error: bucketError } = await ensureQuestionImageBucketExists();

    if (bucketError) {
      throw new Error(bucketError);
    }

    const existingQuestions = await db
      .select({ order: questions.order })
      .from(questions)
      .where(eq(questions.testId, testId))
      .orderBy(desc(questions.order))
      .limit(1);

    const startingOrder = existingQuestions[0]?.order ?? 0;

    const importedValues = await Promise.all(
      questionsWithImages.map(async (question, index) => {
        const order = startingOrder + index + 1;
        const questionImageUrl = question.extractedImage
          ? await uploadImportedQuestionImage(
              supabase,
              testId,
              order,
              question.sourcePageNumber ?? 1,
              question.extractedImage
            )
          : null;

        return {
          testId,
          prompt: question.prompt,
          questionImageUrl,
          optionA: question.optionA,
          optionB: question.optionB,
          optionC: question.optionC,
          optionD: question.optionD,
          correctOption: question.correctOption,
          explanation: question.explanation,
          order,
        };
      })
    );

    await db.insert(questions).values(importedValues);

    const importedImageCount = importedValues.filter((question) => question.questionImageUrl).length;
    const pendingAnswerCount = importedValues.filter((question) => !question.correctOption).length;
    const baseSummary = `Imported ${parsedQuestions.length} questions from ${file.name}${
      importedImageCount ? ` with ${importedImageCount} matched image${importedImageCount === 1 ? '' : 's'}` : ''
    }.`;
    const pendingAnswerMessage = pendingAnswerCount
      ? ` ${pendingAnswerCount} question${pendingAnswerCount === 1 ? ' is' : 's are'} pending answer keys.`
      : '';
    const skippedQuestionMessage = skipped.length ? ` Skipped ${skipped.length} unsupported questions.` : '';
    const skippedImageMessage = skippedImagePages.length
      ? ` Skipped image extraction on ${skippedImagePages.length} page${skippedImagePages.length === 1 ? '' : 's'}.`
      : '';
    const summaryMessage = `${baseSummary}${pendingAnswerMessage}${skippedQuestionMessage}${skippedImageMessage}`;

    return json(summaryMessage, 200, {
      importedCount: parsedQuestions.length,
      importedImageCount,
      pendingAnswerCount,
      skipped,
      skippedImagePages,
      imageMatchWarnings,
      sourceFileName: file.name,
      extractedPageImageCount: imagePages.reduce((total, page) => total + page.images.length, 0),
    });
  } catch (error) {
    return json(getFriendlyImportErrorMessage(error), 400);
  } finally {
    await parser?.destroy();
  }
};

export const ALL: APIRoute = async () =>
  new Response(null, {
    status: 405,
    headers: { Allow: 'POST' },
  });
