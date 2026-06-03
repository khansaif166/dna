ALTER TABLE "tests"
  ADD COLUMN IF NOT EXISTS "sub_topic_id" uuid;

ALTER TABLE "tests"
  ADD CONSTRAINT "tests_sub_topic_id_sub_topics_id_fk"
  FOREIGN KEY ("sub_topic_id")
  REFERENCES "public"."sub_topics"("id")
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;
