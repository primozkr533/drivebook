DROP INDEX "dealer_licence_history_dealer_id_idx";--> statement-breakpoint
ALTER TABLE "plans" RENAME COLUMN "sms_included" TO "monthly_sms_quota";--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "monthly_sms_quota" SET DEFAULT 300;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "dealer_licence_history" ADD COLUMN "previous_valid_until" date;--> statement-breakpoint
ALTER TABLE "dealer_licence_history" ADD COLUMN "valid_until" date;--> statement-breakpoint
-- Open-ended periods from before 0003 get a one-year licence from their start.
UPDATE "dealer_licence_history" SET "valid_until" = (coalesce("valid_to", "valid_from" + interval '1 year') AT TIME ZONE 'Europe/Ljubljana')::date;--> statement-breakpoint
ALTER TABLE "dealer_licence_history" ALTER COLUMN "valid_until" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dealer_licence_history" ADD COLUMN "created_by_backoffice_user_id" uuid;--> statement-breakpoint
ALTER TABLE "dealers" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "dealers" ADD COLUMN "dpa_signed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dealers" ADD COLUMN "dpa_signed_at" date;--> statement-breakpoint
ALTER TABLE "dealers" ADD COLUMN "licence_valid_until" date;--> statement-breakpoint
UPDATE "dealers" SET "licence_valid_until" = h."valid_until" FROM (SELECT "dealer_id", max("valid_until") AS "valid_until" FROM "dealer_licence_history" GROUP BY "dealer_id") h WHERE h."dealer_id" = "dealers"."id";--> statement-breakpoint
ALTER TABLE "holiday_overrides" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "dealer_licence_history" ADD CONSTRAINT "dealer_licence_history_created_by_backoffice_user_id_backoffice_users_id_fk" FOREIGN KEY ("created_by_backoffice_user_id") REFERENCES "public"."backoffice_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dealer_licence_history_dealer_id_created_at_idx" ON "dealer_licence_history" USING btree ("dealer_id","created_at");--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_name_unique" UNIQUE("name");