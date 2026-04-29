CREATE TABLE "image_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"role" text NOT NULL,
	"position" integer,
	"url" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text,
	"content_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "image_usage" ADD CONSTRAINT "image_usage_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_iu_source" ON "image_usage" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "idx_iu_hash" ON "image_usage" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "idx_iu_article" ON "image_usage" USING btree ("article_id");