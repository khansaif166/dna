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
  topicId: string;
  topicName: string;
  subjectName: string;
}

export type MasteryLevel = 'not_started' | 'attempted' | 'familiar' | 'proficient';

export interface TopicMasteryRow {
  topicId: string;
  topicName: string;
  subjectName: string;
  correct: number;
  total: number;
  percent: number;
  level: MasteryLevel;
  points: number;
}

export interface MasterySummary {
  masteryPercent: number;
  earnedPoints: number;
  totalPoints: number;
  totalTopics: number;
  levelCounts: Record<MasteryLevel, number>;
  topics: TopicMasteryRow[];
}

export interface RecentAttemptRow {
  attemptId: string;
  testTitle: string;
  subjectName: string;
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

function masteryLevelForPercent(percent: number, total: number): MasteryLevel {
  if (!total) {
    return 'not_started';
  }

  if (percent < 70) {
    return 'attempted';
  }

  if (percent < 100) {
    return 'familiar';
  }

  return 'proficient';
}

function masteryPointsForLevel(level: MasteryLevel) {
  switch (level) {
    case 'familiar':
      return 50;
    case 'proficient':
      return 80;
    default:
      return 0;
  }
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
    .leftJoin(topics, eq(tests.topicId, topics.id))
    .innerJoin(subjects, sql`${subjects.id} = coalesce(${topics.subjectId}, ${tests.subjectId})`)
    .where(and(eq(testAttempts.studentId, studentId), isNotNull(testAttempts.submittedAt)))
    .groupBy(subjects.id, subjects.name)
    .orderBy(subjects.name);

  return rows.map((row) => ({
    ...row,
    percent: toPercent(row.correct, row.total),
  }));
}

export async function getTopicAccuracy(studentId: string, minQuestionCount = 5): Promise<TopicAccuracyRow[]> {
  let query = db
    .select({
      topicId: topics.id,
      topicName: topics.name,
      subjectName: subjects.name,
      correct: sql<number>`sum(case when ${attemptAnswers.isCorrect} = true then 1 else 0 end)::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(attemptAnswers)
    .innerJoin(testAttempts, eq(attemptAnswers.attemptId, testAttempts.id))
    .innerJoin(questions, eq(attemptAnswers.questionId, questions.id))
    .innerJoin(tests, eq(questions.testId, tests.id))
    .innerJoin(topics, eq(tests.topicId, topics.id))
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .where(and(eq(testAttempts.studentId, studentId), isNotNull(testAttempts.submittedAt)))
    .groupBy(topics.id, topics.name, subjects.id, subjects.name)
    .orderBy(subjects.name, topics.name);

  if (minQuestionCount > 0) {
    query = query.having(sql`count(*) >= ${minQuestionCount}`);
  }

  const rows = await query;

  return rows.map((row) => ({
    ...row,
    percent: toPercent(row.correct, row.total),
  }));
}

export async function getMasterySummary(studentId: string): Promise<MasterySummary> {
  const [allTopics, topicAccuracy] = await Promise.all([
    db
      .select({
        topicId: topics.id,
        topicName: topics.name,
        subjectName: subjects.name,
      })
      .from(topics)
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .orderBy(subjects.name, topics.order),
    getTopicAccuracy(studentId, 0),
  ]);

  const accuracyMap = new Map(topicAccuracy.map((topic) => [topic.topicId, topic]));
  const levelCounts: Record<MasteryLevel, number> = {
    not_started: 0,
    attempted: 0,
    familiar: 0,
    proficient: 0,
  };

  const topicsWithMastery = allTopics.map((topic) => {
    const accuracy = accuracyMap.get(topic.topicId);
    const correct = accuracy?.correct ?? 0;
    const total = accuracy?.total ?? 0;
    const percent = accuracy?.percent ?? 0;
    const level = masteryLevelForPercent(percent, total);
    const points = masteryPointsForLevel(level);

    levelCounts[level] += 1;

    return {
      topicId: topic.topicId,
      topicName: topic.topicName,
      subjectName: topic.subjectName,
      correct,
      total,
      percent,
      level,
      points,
    };
  });

  const earnedPoints = topicsWithMastery.reduce((sum, topic) => sum + topic.points, 0);
  const totalPoints = allTopics.length * 80;
  const masteryPercent = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

  return {
    masteryPercent,
    earnedPoints,
    totalPoints,
    totalTopics: allTopics.length,
    levelCounts,
    topics: topicsWithMastery,
  };
}

export async function getRecentAttempts(
  studentId: string,
  limit = 10
): Promise<RecentAttemptRow[]> {
  const rows = await db
    .select({
      attemptId: testAttempts.id,
      testTitle: tests.title,
      subjectName: subjects.name,
      score: testAttempts.score,
      total: testAttempts.totalQuestions,
      submittedAt: testAttempts.submittedAt,
    })
    .from(testAttempts)
    .innerJoin(tests, eq(testAttempts.testId, tests.id))
    .leftJoin(topics, eq(tests.topicId, topics.id))
    .leftJoin(subjects, sql`${subjects.id} = coalesce(${topics.subjectId}, ${tests.subjectId})`)
    .where(and(eq(testAttempts.studentId, studentId), isNotNull(testAttempts.submittedAt)))
    .orderBy(desc(testAttempts.submittedAt))
    .limit(limit);

  return rows.map((row) => {
    const score = row.score ?? 0;
    const total = row.total ?? 0;

    return {
      attemptId: row.attemptId,
      testTitle: row.testTitle,
      subjectName: row.subjectName ?? 'General',
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
    .filter((row) => row.percent < 70)
    .sort((a, b) => a.percent - b.percent);

  return { strong, weak };
}
