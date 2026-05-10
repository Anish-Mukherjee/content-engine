CREATE TABLE "customer_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"intended_org_name" text NOT NULL,
	"inviter_user_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"accepted_user_id" text,
	"accepted_org_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_invite_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "customer_invite" ADD CONSTRAINT "customer_invite_inviter_user_id_user_id_fk" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invite" ADD CONSTRAINT "customer_invite_accepted_user_id_user_id_fk" FOREIGN KEY ("accepted_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invite" ADD CONSTRAINT "customer_invite_accepted_org_id_organization_id_fk" FOREIGN KEY ("accepted_org_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ci_status_email" ON "customer_invite" USING btree ("status","email");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_ci_token" ON "customer_invite" USING btree ("token");