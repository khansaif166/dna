import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['student', 'admin']);
export const optionChoiceEnum = pgEnum('option_choice', ['a', 'b', 'c', 'd']);
export const testStatusEnum = pgEnum('test_status', ['draft', 'published']);
export const testTypeEnum = pgEnum('test_type', ['topic_practice', 'mock_exam']);
export const attemptModeEnum = pgEnum('attempt_mode', ['single', 'multiple']);

export const profiles = pgTable('profiles', {
  // Matches auth.users.id. Supabase manages that relationship outside Drizzle.
  id: uuid('id').primaryKey(),
  fullName: text('full_name').notNull(),
  role: roleEnum('role').default('student').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const subjects = pgTable(
  'subjects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    order: smallint('order').notNull(),
  },
  (table) => ({
    orderUnique: unique('subjects_order_unique').on(table.order),
  })
);

export const topics = pgTable(
  'topics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectId: uuid('subject_id')
      .references(() => subjects.id)
      .notNull(),
    name: text('name').notNull(),
    order: smallint('order').notNull(),
  },
  (table) => ({
    subjectOrderUnique: unique('topics_subject_id_order_unique').on(table.subjectId, table.order),
  })
);

export const topicResources = pgTable(
  'topic_resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topicId: uuid('topic_id')
      .references(() => topics.id)
      .notNull(),
    title: text('title').notNull(),
    youtubeUrl: text('youtube_url').notNull(),
    notes: text('notes'),
    order: smallint('order').notNull(),
  },
  (table) => ({
    topicOrderUnique: unique('topic_resources_topic_id_order_unique').on(table.topicId, table.order),
  })
);

export const tests = pgTable('tests', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  subjectId: uuid('subject_id').references(() => subjects.id),
  topicId: uuid('topic_id').references(() => topics.id),
  durationMinutes: integer('duration_minutes').notNull(),
  status: testStatusEnum('status').default('draft').notNull(),
  testType: testTypeEnum('test_type').default('topic_practice').notNull(),
  attemptMode: attemptModeEnum('attempt_mode').default('multiple').notNull(),
  publishedAt: timestamp('published_at'),
  createdBy: uuid('created_by').references(() => profiles.id),
  createdAt: timestamp('created_at').defaultNow(),
});

export const questions = pgTable(
  'questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    testId: uuid('test_id')
      .references(() => tests.id)
      .notNull(),
    prompt: text('prompt').notNull(),
    optionA: text('option_a').notNull(),
    optionB: text('option_b').notNull(),
    optionC: text('option_c').notNull(),
    optionD: text('option_d').notNull(),
    correctOption: optionChoiceEnum('correct_option').notNull(),
    explanation: text('explanation'),
    order: smallint('order').notNull(),
  },
  (table) => ({
    testOrderUnique: unique('questions_test_id_order_unique').on(table.testId, table.order),
  })
);

export const testAttempts = pgTable('test_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id')
    .references(() => profiles.id)
    .notNull(),
  testId: uuid('test_id')
    .references(() => tests.id)
    .notNull(),
  startedAt: timestamp('started_at').defaultNow(),
  submittedAt: timestamp('submitted_at'),
  timeTakenSeconds: integer('time_taken_seconds'),
  score: integer('score'),
  totalQuestions: integer('total_questions'),
});

export const attemptAnswers = pgTable(
  'attempt_answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attemptId: uuid('attempt_id')
      .references(() => testAttempts.id)
      .notNull(),
    questionId: uuid('question_id')
      .references(() => questions.id)
      .notNull(),
    chosenOption: optionChoiceEnum('chosen_option'),
    isCorrect: boolean('is_correct'),
  },
  (table) => ({
    attemptQuestionUnique: unique('attempt_answers_attempt_id_question_id_unique').on(
      table.attemptId,
      table.questionId
    ),
  })
);
