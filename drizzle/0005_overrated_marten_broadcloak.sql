ALTER TABLE "articles" ALTER COLUMN "site_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dataforseo_tasks" ALTER COLUMN "site_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "image_usage" ALTER COLUMN "site_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "keyword_results" ALTER COLUMN "site_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "seed_keywords" ALTER COLUMN "site_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataforseo_tasks" ADD CONSTRAINT "dataforseo_tasks_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_usage" ADD CONSTRAINT "image_usage_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_results" ADD CONSTRAINT "keyword_results_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seed_keywords" ADD CONSTRAINT "seed_keywords_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;