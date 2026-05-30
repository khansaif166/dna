CREATE TYPE "public"."attempt_mode" AS ENUM('single', 'multiple');--> statement-breakpoint
CREATE TYPE "public"."option_choice" AS ENUM('a', 'b', 'c', 'd');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('student', 'admin');--> statement-breakpoint
CREATE TYPE "public"."test_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."test_type" AS ENUM('topic_practice', 'mock_exam');--> statement-breakpoint
CREATE TABLE "attempt_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"chosen_option" "option_choice",
	"is_correct" boolean,
	CONSTRAINT "attempt_answers_attempt_id_question_id_unique" UNIQUE("attempt_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"role" "role" DEFAULT 'student' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"option_a" text NOT NULL,
	"option_b" text NOT NULL,
	"option_c" text NOT NULL,
	"option_d" text NOT NULL,
	"correct_option" "option_choice" NOT NULL,
	"explanation" text,
	"order" smallint NOT NULL,
	CONSTRAINT "questions_test_id_order_unique" UNIQUE("test_id","order")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"order" smallint NOT NULL,
	CONSTRAINT "subjects_order_unique" UNIQUE("order")
);
--> statement-breakpoint
CREATE TABLE "test_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"started_at" timestamp DEFAULT now(),
	"submitted_at" timestamp,
	"time_taken_seconds" integer,
	"score" integer,
	"total_questions" integer
);
--> statement-breakpoint
CREATE TABLE "tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"subject_id" uuid,
	"topic_id" uuid,
	"duration_minutes" integer NOT NULL,
	"status" "test_status" DEFAULT 'draft' NOT NULL,
	"test_type" "test_type" DEFAULT 'topic_practice' NOT NULL,
	"attempt_mode" "attempt_mode" DEFAULT 'multiple' NOT NULL,
	"published_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "topic_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"title" text NOT NULL,
	"youtube_url" text NOT NULL,
	"notes" text,
	"order" smallint NOT NULL,
	CONSTRAINT "topic_resources_topic_id_order_unique" UNIQUE("topic_id","order")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"name" text NOT NULL,
	"order" smallint NOT NULL,
	CONSTRAINT "topics_subject_id_order_unique" UNIQUE("subject_id","order")
);
--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_id_test_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."test_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_student_id_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_resources" ADD CONSTRAINT "topic_resources_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;
