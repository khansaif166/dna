import { z } from 'zod';
import type { PageTextResult } from 'pdf-parse';

const optionKeys = ['a', 'b', 'c', 'd'] as const;
const numericOptionMap = {
  '1': 'a',
  '2': 'b',
  '3': 'c',
  '4': 'd',
} as const;

type OptionKey = (typeof optionKeys)[number];
type NumericOptionKey = keyof typeof numericOptionMap;

type DraftQuestion = {
  sourceQuestionNumber: number | null;
  sourcePageNumber: number | null;
  prompt: string;
  options: Partial<Record<OptionKey, string>>;
  correctAnswerRaw: string;
  explanation: string;
  activeField: 'prompt' | OptionKey | 'explanation' | null;
};

type NumericDraftQuestion = {
  number: number;
  prompt: string;
  options: Partial<Record<NumericOptionKey, string>>;
  activeField: 'prompt' | NumericOptionKey | null;
};

type SkippedQuestion = {
  questionNumber: number;
  reason: string;
  prompt?: string;
};

export type ParsedPdfQuestionsResult = {
  questions: ParsedImportedQuestion[];
  skipped: SkippedQuestion[];
};

export const importedQuestionSchema = z
  .object({
    prompt: z.string().min(1),
    optionA: z.string().min(1),
    optionB: z.string().min(1),
    optionC: z.string().min(1),
    optionD: z.string().min(1),
    correctOption: z.enum(optionKeys).nullable(),
    explanation: z.string().nullable(),
  })
  .superRefine((data, ctx) => {
    const normalizedOptions = [
      { key: 'optionA', value: data.optionA.trim().toLowerCase() },
      { key: 'optionB', value: data.optionB.trim().toLowerCase() },
      { key: 'optionC', value: data.optionC.trim().toLowerCase() },
      { key: 'optionD', value: data.optionD.trim().toLowerCase() },
    ];

    const seen = new Map<string, string>();

    for (const option of normalizedOptions) {
      const duplicateOf = seen.get(option.value);

      if (duplicateOf) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [option.key],
          message: 'Each option must be unique.',
        });
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [duplicateOf],
          message: 'Each option must be unique.',
        });
        return;
      }

      seen.set(option.value, option.key);
    }
  });

export type ImportedQuestion = z.infer<typeof importedQuestionSchema>;
export type ParsedImportedQuestion = ImportedQuestion & {
  sourcePageNumber: number | null;
  sourceQuestionNumber: number | null;
};
export type ParsedAnswerKeyEntry = {
  questionNumber: number;
  correctOption: OptionKey;
};

const questionStartPattern = /^(?:q(?:uestion)?\s*)?(\d+)[)\].:-]?\s+(.+)$/i;
const optionPattern = /^([a-d])[)\].:-]\s*(.+)$/i;
const answerPattern = /^(?:answer|correct answer|ans)\s*[:.-]?\s*(.+)$/i;
const explanationPattern = /^explanation\s*[:.-]?\s*(.*)$/i;

const numberedQuestionPattern = /^(\d+)\.\s+(.+)$/;
const numberedOptionPattern = /^\((\d)\)\s*(.*)$/;
const answerKeyPattern = /^(\d+)\.\s*\(([^)]+)\)$/;

const ignoredPdfLinePatterns = [
  /^NEET\b/i,
  /^ENGLISH$/i,
  /^Test Booklet Code$/i,
  /^\|\|\s*DATE:/i,
  /^\[\d+\]/,
  /^--\s*\d+\s+of\s+\d+\s*--$/i,
  /^PW Web\/App/i,
  /^Library-/i,
  /^Hints & Solutions$/i,
  /^Android App$/i,
  /^iOS App$/i,
  /^PW Website$/i,
  /^■■■$/,
  /^\|\s*\|/,
  /^\[Contd\.\.\.$/i,
  /^\[Contd\.\.\.\]$/i,
];

function appendValue(current: string, next: string) {
  return current ? `${current} ${next}` : next;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function shouldIgnorePdfLine(line: string) {
  return ignoredPdfLinePatterns.some((pattern) => pattern.test(line));
}

function normalizePdfLines(text: string) {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line && !shouldIgnorePdfLine(line));
}

function normalizePdfPageLines(pages: PageTextResult[]) {
  return pages.flatMap((page) =>
    normalizePdfLines(page.text).map((line) => ({
      line,
      pageNumber: page.num,
    }))
  );
}

function findFirstQuestionStartIndex(lines: string[]) {
  for (let index = 0; index < lines.length; index += 1) {
    if (!numberedQuestionPattern.test(lines[index])) {
      continue;
    }

    const nearbyLines = lines.slice(index + 1, index + 9);

    if (nearbyLines.some((line) => numberedOptionPattern.test(line))) {
      return index;
    }
  }

  return 0;
}

function looksLikeNumberedOptionPdf(text: string) {
  const lines = normalizePdfLines(text);
  const startIndex = findFirstQuestionStartIndex(lines);
  const relevantLines = lines.slice(startIndex, startIndex + 40);

  return relevantLines.some((line) => numberedOptionPattern.test(line));
}

function createDraft(initialPrompt: string, sourcePageNumber: number): DraftQuestion {
  return {
    sourceQuestionNumber: null,
    sourcePageNumber,
    prompt: initialPrompt,
    options: {},
    correctAnswerRaw: '',
    explanation: '',
    activeField: 'prompt',
  };
}

function finalizeDraft(draft: DraftQuestion, questionIndex: number): ParsedImportedQuestion {
  const optionA = draft.options.a?.trim();
  const optionB = draft.options.b?.trim();
  const optionC = draft.options.c?.trim();
  const optionD = draft.options.d?.trim();

  if (!draft.prompt.trim()) {
    throw new Error(`Question ${questionIndex} is missing its prompt.`);
  }

  if (!optionA || !optionB || !optionC || !optionD) {
    throw new Error(`Question ${questionIndex} must include options A, B, C, and D.`);
  }

  const rawAnswer = draft.correctAnswerRaw.trim();

  let correctOption: OptionKey | null = null;

  if (rawAnswer) {
    const answerLetterMatch = rawAnswer.match(/^([a-d])(?:\b|[)\].:-])/i);
    correctOption = answerLetterMatch?.[1]?.toLowerCase() as OptionKey | null;

    if (!correctOption) {
      const normalizedAnswer = normalizeText(rawAnswer);
      correctOption = optionKeys.find((key) => normalizeText(draft.options[key] ?? '') === normalizedAnswer) ?? null;
    }

    if (!correctOption) {
      throw new Error(`Question ${questionIndex} has an answer that does not match options A-D.`);
    }
  }

  return {
    ...importedQuestionSchema.parse({
      prompt: draft.prompt.trim(),
      optionA,
      optionB,
      optionC,
      optionD,
      correctOption,
      explanation: draft.explanation.trim() || null,
    }),
    sourcePageNumber: draft.sourcePageNumber,
    sourceQuestionNumber: draft.sourceQuestionNumber ?? questionIndex,
  };
}

function parseSimpleQuestionPdfFromPages(pages: PageTextResult[]): ParsedPdfQuestionsResult {
  const lines = normalizePdfPageLines(pages);
  const questions: ParsedImportedQuestion[] = [];
  let currentDraft: DraftQuestion | null = null;

  for (const { line, pageNumber } of lines) {
    const questionMatch = line.match(questionStartPattern);

    if (questionMatch) {
      if (currentDraft) {
        questions.push(finalizeDraft(currentDraft, questions.length + 1));
      }

      currentDraft = createDraft(questionMatch[2].trim(), pageNumber);
      currentDraft.sourceQuestionNumber = Number(questionMatch[1]);
      continue;
    }

    if (!currentDraft) {
      continue;
    }

    const optionMatch = line.match(optionPattern);

    if (optionMatch) {
      const optionKey = optionMatch[1].toLowerCase() as OptionKey;
      currentDraft.options[optionKey] = optionMatch[2].trim();
      currentDraft.activeField = optionKey;
      continue;
    }

    const answerMatch = line.match(answerPattern);

    if (answerMatch) {
      currentDraft.correctAnswerRaw = answerMatch[1].trim();
      currentDraft.activeField = null;
      continue;
    }

    const explanationMatch = line.match(explanationPattern);

    if (explanationMatch) {
      currentDraft.explanation = explanationMatch[1].trim();
      currentDraft.activeField = 'explanation';
      continue;
    }

    if (currentDraft.activeField === 'prompt') {
      currentDraft.prompt = appendValue(currentDraft.prompt, line);
      continue;
    }

    if (currentDraft.activeField && currentDraft.activeField !== 'explanation') {
      const optionKey = currentDraft.activeField;
      currentDraft.options[optionKey] = appendValue(currentDraft.options[optionKey] ?? '', line);
      continue;
    }

    if (currentDraft.activeField === 'explanation') {
      currentDraft.explanation = appendValue(currentDraft.explanation, line);
    }
  }

  if (currentDraft) {
    questions.push(finalizeDraft(currentDraft, questions.length + 1));
  }

  if (!questions.length) {
    throw new Error(
      'No questions were detected in the PDF. Use a format like "1. Question", "A. ...", "B. ...", "Answer: B".'
    );
  }

  return {
    questions,
    skipped: [],
  };
}

function createNumericDraft(number: number, initialPrompt: string): NumericDraftQuestion {
  return {
    number,
    prompt: initialPrompt,
    options: {},
    activeField: 'prompt',
  };
}

function parseAnswerKeySection(text: string) {
  const lines = normalizePdfLines(text);
  const answers = new Map<number, OptionKey>();
  const skipped: SkippedQuestion[] = [];

  for (const line of lines) {
    if (line === 'ANSWER KEY') {
      continue;
    }

    if (/^Q\d+\s+Text Solution:/i.test(line)) {
      break;
    }

    const match = line.match(answerKeyPattern);

    if (!match) {
      continue;
    }

    const questionNumber = Number(match[1]);
    const answerValue = match[2].replace(/\s+/g, '');

    if (!/^[1-4]$/.test(answerValue)) {
      skipped.push({
        questionNumber,
        reason: `Unsupported answer key value "${match[2]}".`,
      });
      continue;
    }

    answers.set(questionNumber, numericOptionMap[answerValue as NumericOptionKey]);
  }

  return { answers, skipped };
}

export function parseAnswerKeyEntriesFromText(text: string) {
  const normalizedText = text.replace(/\r/g, '');
  const { answers } = parseAnswerKeySection(normalizedText);

  if (answers.size > 0) {
    return [...answers.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([questionNumber, correctOption]) => ({
        questionNumber,
        correctOption,
      }));
  }

  const entries = new Map<number, OptionKey>();
  const lines = normalizePdfLines(normalizedText);
  const inlinePatterns = [
    /^(\d+)\s*[.)-]?\s*[:\s-]*\(?([1-4])\)?$/,
    /^(\d+)\s*[.)-]?\s*[:\s-]*([A-D])$/i,
  ];

  for (const line of lines) {
    for (const pattern of inlinePatterns) {
      const match = line.match(pattern);

      if (!match) {
        continue;
      }

      const questionNumber = Number(match[1]);
      const rawValue = match[2].toLowerCase();
      const correctOption = /^[1-4]$/.test(rawValue)
        ? numericOptionMap[rawValue as NumericOptionKey]
        : (rawValue as OptionKey);

      entries.set(questionNumber, correctOption);
      break;
    }
  }

  return [...entries.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([questionNumber, correctOption]) => ({
      questionNumber,
      correctOption,
    }));
}

function finalizeNumericDraft(
  draft: NumericDraftQuestion,
  answers: Map<number, OptionKey>,
  sourcePageNumber: number
): ParsedImportedQuestion {
  const option1 = draft.options['1']?.trim();
  const option2 = draft.options['2']?.trim();
  const option3 = draft.options['3']?.trim();
  const option4 = draft.options['4']?.trim();

  if (!draft.prompt.trim()) {
    throw new Error('Missing question prompt.');
  }

  if (!option1 || !option2 || !option3 || !option4) {
    throw new Error('Missing one or more options.');
  }

  const correctOption = answers.get(draft.number) ?? null;

  return {
    ...importedQuestionSchema.parse({
      prompt: draft.prompt.trim(),
      optionA: option1,
      optionB: option2,
      optionC: option3,
      optionD: option4,
      correctOption,
      explanation: null,
    }),
    sourcePageNumber,
    sourceQuestionNumber: draft.number,
  };
}

function parseAnswerKeyPdf(text: string, pages: PageTextResult[]): ParsedPdfQuestionsResult {
  const answerKeyIndex = text.indexOf('ANSWER KEY');

  if (answerKeyIndex === -1) {
    throw new Error('Could not locate the answer key section in the PDF.');
  }

  const questionSection = text.slice(0, answerKeyIndex);
  const answerSection = text.slice(answerKeyIndex);
  const normalizedQuestionLines = normalizePdfLines(questionSection);
  const questionLines = normalizedQuestionLines.slice(findFirstQuestionStartIndex(normalizedQuestionLines));
  const pageNumbersByQuestion = new Map<number, number>();
  const pageLineEntries = normalizePdfPageLines(pages);
  const { answers, skipped: skippedAnswers } = parseAnswerKeySection(answerSection);

  for (const { line, pageNumber } of pageLineEntries) {
    const questionMatch = line.match(numberedQuestionPattern);

    if (questionMatch && !pageNumbersByQuestion.has(Number(questionMatch[1]))) {
      pageNumbersByQuestion.set(Number(questionMatch[1]), pageNumber);
    }
  }

  const questions: ParsedImportedQuestion[] = [];
  const skipped = [...skippedAnswers];
  let currentDraft: NumericDraftQuestion | null = null;

  const pushDraft = () => {
    if (!currentDraft) {
      return;
    }

    try {
      questions.push(
        finalizeNumericDraft(currentDraft, answers, pageNumbersByQuestion.get(currentDraft.number) ?? 1)
      );
    } catch (error) {
      skipped.push({
        questionNumber: currentDraft.number,
        reason: error instanceof Error ? error.message : 'Unsupported question format.',
        prompt: currentDraft.prompt.trim() || undefined,
      });
    }
  };

  for (const line of questionLines) {
    const questionMatch = line.match(numberedQuestionPattern);

    if (questionMatch) {
      pushDraft();
      currentDraft = createNumericDraft(Number(questionMatch[1]), questionMatch[2].trim());
      continue;
    }

    if (!currentDraft) {
      continue;
    }

    const optionMatch = line.match(numberedOptionPattern);

    if (optionMatch) {
      const optionKey = optionMatch[1] as NumericOptionKey;
      currentDraft.options[optionKey] = optionMatch[2].trim();
      currentDraft.activeField = optionKey;
      continue;
    }

    if (currentDraft.activeField === 'prompt') {
      currentDraft.prompt = appendValue(currentDraft.prompt, line);
      continue;
    }

    if (currentDraft.activeField) {
      const optionKey = currentDraft.activeField;
      currentDraft.options[optionKey] = appendValue(currentDraft.options[optionKey] ?? '', line);
    }
  }

  pushDraft();

  if (!questions.length) {
    throw new Error('No importable questions were detected in the PDF.');
  }

  return {
    questions,
    skipped,
  };
}

function parseNumberedQuestionPdfWithoutAnswers(text: string, pages: PageTextResult[]): ParsedPdfQuestionsResult {
  const normalizedQuestionLines = normalizePdfLines(text);
  const questionLines = normalizedQuestionLines.slice(findFirstQuestionStartIndex(normalizedQuestionLines));
  const pageNumbersByQuestion = new Map<number, number>();
  const pageLineEntries = normalizePdfPageLines(pages);
  const questions: ParsedImportedQuestion[] = [];
  const skipped: SkippedQuestion[] = [];
  let currentDraft: NumericDraftQuestion | null = null;

  for (const { line, pageNumber } of pageLineEntries) {
    const questionMatch = line.match(numberedQuestionPattern);

    if (questionMatch && !pageNumbersByQuestion.has(Number(questionMatch[1]))) {
      pageNumbersByQuestion.set(Number(questionMatch[1]), pageNumber);
    }
  }

  const pushDraft = () => {
    if (!currentDraft) {
      return;
    }

    try {
      questions.push(finalizeNumericDraft(currentDraft, new Map(), pageNumbersByQuestion.get(currentDraft.number) ?? 1));
    } catch (error) {
      skipped.push({
        questionNumber: currentDraft.number,
        reason: error instanceof Error ? error.message : 'Unsupported question format.',
        prompt: currentDraft.prompt.trim() || undefined,
      });
    }
  };

  for (const line of questionLines) {
    const questionMatch = line.match(numberedQuestionPattern);

    if (questionMatch) {
      pushDraft();
      currentDraft = createNumericDraft(Number(questionMatch[1]), questionMatch[2].trim());
      continue;
    }

    if (!currentDraft) {
      continue;
    }

    const optionMatch = line.match(numberedOptionPattern);

    if (optionMatch) {
      const optionKey = optionMatch[1] as NumericOptionKey;
      currentDraft.options[optionKey] = optionMatch[2].trim();
      currentDraft.activeField = optionKey;
      continue;
    }

    if (currentDraft.activeField === 'prompt') {
      currentDraft.prompt = appendValue(currentDraft.prompt, line);
      continue;
    }

    if (currentDraft.activeField) {
      const optionKey = currentDraft.activeField;
      currentDraft.options[optionKey] = appendValue(currentDraft.options[optionKey] ?? '', line);
    }
  }

  pushDraft();

  if (!questions.length) {
    throw new Error('No importable questions were detected in the PDF.');
  }

  return {
    questions,
    skipped,
  };
}

export function parseQuestionsFromPdfText(text: string, pages?: PageTextResult[]): ParsedPdfQuestionsResult {
  const normalizedPages = pages?.length ? pages : [{ num: 1, text }];

  if (text.includes('ANSWER KEY')) {
    return parseAnswerKeyPdf(text, normalizedPages);
  }

  if (looksLikeNumberedOptionPdf(text)) {
    return parseNumberedQuestionPdfWithoutAnswers(text, normalizedPages);
  }

  return parseSimpleQuestionPdfFromPages(normalizedPages);
}
