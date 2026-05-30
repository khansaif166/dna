import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';

import { attemptAnswers, db, questions, subjects, testAttempts, tests, topics } from '../db';

export interface AccuracyRow {
  correct: number;
  total: number;
  percent: number;
}

export interface SubjectAccuracyRow extends AccuracyRow {
  subjectName: string;
}

export interface TopicAccuracyRow extends AccuracyRow {
  topicName: string;
}

export interface RecentAttemptRow {
  attemptId: string;
  testTitle: string;
  score: number;
  total: number;
  submittedAt: Date;
  percent: number;
}

function toPercent(correct: number, total: number) {
  if (!total) {
    return 0;
  }

  return Math.round((correct / total) * 100);
}

export async function getSubjectAccuracy(studentId: string): Promise<SubjectAccuracyRow[]> {
  const rows = await db
    .select({
      subjectName: subjects.name,
      correct: sql<number>`sum(case when ${attemptAnswers.isCorrect} = true then 1 else 0 end)::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(attemptAnswers)
    .innerJoin(testAttempts, eq(attemptAnswers.attemptId, testAttempts.id))
    .innerJoin(questions, eq(attemptAnswers.questionId, questions.id))
    .innerJoin(tests, eq(questions.testId, tests.id))
    .innerJoin(subjects, eq(tests.subjectId, subjects.id))
    .where(and(eq(testAttempts.studentId, studentId), isNotNull(testAttempts.submittedAt)))
    .groupBy(subjects.name)
    .orderBy(subjects.name);

  return rows.map((row) => ({
    ...row,
    percent: toPercent(row.correct, row.total),
  }));
}

export async function getTopicAccuracy(studentId: string): Promise<TopicAccuracyRow[]> {
  const rows = await db
    .select({
      topicName: topics.name,
      correct: sql<number>`sum(case when ${attemptAnswers.isCorrect} = true then 1 else 0 end)::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(attemptAnswers)
    .innerJoin(testAttempts, eq(attemptAnswers.attemptId, testAttempts.id))
    .innerJoin(questions, eq(attemptAnswers.questionId, questions.id))
    .innerJoin(tests, eq(questions.testId, tests.id))
    .innerJoin(topics, eq(tests.topicId, topics.id))
    .where(and(eq(testAttempts.studentId, studentId), isNotNull(testAttempts.submittedAt)))
    .groupBy(topics.name)
    .having(sql`count(*) >= 5`)
    .orderBy(topics.name);

  return rows.map((row) => ({
    ...row,
    percent: toPercent(row.correct, row.total),
  }));
}

export async function getRecentAttempts(
  studentId: string,
  limit = 10
): Promise<RecentAttemptRow[]> {
  const rows = await db
    .select({
      attemptId: testAttempts.id,
      testTitle: tests.title,
      score: testAttempts.score,
      total: testAttempts.totalQuestions,
      submittedAt: testAttempts.submittedAt,
    })
    .from(testAttempts)
    .innerJoin(tests, eq(testAttempts.testId, tests.id))
    .where(and(eq(testAttempts.studentId, studentId), isNotNull(testAttempts.submittedAt)))
    .orderBy(desc(testAttempts.submittedAt))
    .limit(limit);

  return rows.map((row) => {
    const score = row.score ?? 0;
    const total = row.total ?? 0;

    return {
      attemptId: row.attemptId,
      testTitle: row.testTitle,
      score,
      total,
      submittedAt: row.submittedAt as Date,
      percent: toPercent(score, total),
    };
  });
}

export async function getWeakAndStrongTopics(studentId: string): Promise<{
  strong: TopicAccuracyRow[];
  weak: TopicAccuracyRow[];
}> {
  const topicAccuracy = await getTopicAccuracy(studentId);

  const strong = topicAccuracy
    .filter((row) => row.percent >= 70)
    .sort((a, b) => b.percent - a.percent);

  const weak = topicAccuracy
    .filter((row) => row.percent < 40)
    .sort((a, b) => a.percent - b.percent);

  return { strong, weak };
}
