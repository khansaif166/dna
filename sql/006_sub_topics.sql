CREATE TABLE IF NOT EXISTS "sub_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"name" text NOT NULL,
	"order" smallint NOT NULL,
	CONSTRAINT "sub_topics_topic_id_order_unique" UNIQUE("topic_id","order")
);

ALTER TABLE "sub_topics"
	ADD CONSTRAINT "sub_topics_topic_id_topics_id_fk"
	FOREIGN KEY ("topic_id")
	REFERENCES "public"."topics"("id")
	ON DELETE NO ACTION
	ON UPDATE NO ACTION;
