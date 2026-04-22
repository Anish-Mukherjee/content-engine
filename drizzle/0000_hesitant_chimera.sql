CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keyword_result_id" uuid,
	"keyword" text NOT NULL,
	"category" text NOT NULL,
	"search_volume" integer,
	"competition" real,
	"cpc" real,
	"status" text NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"perplexity_brief" jsonb,
	"outline" jsonb,
	"title" text,
	"slug" text,
	"meta_title" text,
	"meta_description" text,
	"secondary_keywords" jsonb,
	"article_html" text,
	"word_count" integer,
	"estimated_read_time" text,
	"hero_image" jsonb,
	"faq_schema" jsonb,
	"scheduled_at" timestamp,
	"published_at" timestamp,
	"researched_at" timestamp,
	"outlined_at" timestamp,
	"written_at" timestamp,
	"image_fetched_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dataforseo_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_task_id" text NOT NULL,
	"seed_keyword_id" uuid NOT NULL,
	"status" text NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"retrieved_at" timestamp,
	"result_count" integer,
	"error" text,
	CONSTRAINT "dataforseo_tasks_external_task_id_unique" UNIQUE("external_task_id")
);
--> statement-breakpoint
CREATE TABLE "keyword_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keyword" text NOT NULL,
	"category" text NOT NULL,
	"seed_keyword_id" uuid NOT NULL,
	"dataforseo_task_id" uuid NOT NULL,
	"search_volume" integer,
	"competition" real,
	"cpc" real,
	"keyword_difficulty" integer,
	"trend" text,
	"status" text NOT NULL,
	"filter_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "seed_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keyword" text NOT NULL,
	"category" text NOT NULL,
	"last_used_at" timestamp,
	"times_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_keyword_result_id_keyword_results_id_fk" FOREIGN KEY ("keyword_result_id") REFERENCES "public"."keyword_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataforseo_tasks" ADD CONSTRAINT "dataforseo_tasks_seed_keyword_id_seed_keywords_id_fk" FOREIGN KEY ("seed_keyword_id") REFERENCES "public"."seed_keywords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_results" ADD CONSTRAINT "keyword_results_seed_keyword_id_seed_keywords_id_fk" FOREIGN KEY ("seed_keyword_id") REFERENCES "public"."seed_keywords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_results" ADD CONSTRAINT "keyword_results_dataforseo_task_id_dataforseo_tasks_id_fk" FOREIGN KEY ("dataforseo_task_id") REFERENCES "public"."dataforseo_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_art_status" ON "articles" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_art_slug" ON "articles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_art_scheduled" ON "articles" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_art_published" ON "articles" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "idx_dfs_pending" ON "dataforseo_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_kr_keyword" ON "keyword_results" USING btree ("keyword");--> statement-breakpoint
CREATE INDEX "idx_kr_status" ON "keyword_results" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_seed_rotation" ON "seed_keywords" USING btree ("category","last_used_at");