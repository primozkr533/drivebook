CREATE TABLE "dealer_closures" (
	"id" text PRIMARY KEY NOT NULL,
	"dealer_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dealer_closures_valid_range" CHECK ("dealer_closures"."end_date" >= "dealer_closures"."start_date")
);
--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "max_users" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_rules" ALTER COLUMN "slot_minutes" SET DEFAULT 15;--> statement-breakpoint
ALTER TABLE "booking_rules" ALTER COLUMN "max_days_ahead" SET DEFAULT 14;--> statement-breakpoint
ALTER TABLE "booking_rules" ALTER COLUMN "buffer_minutes" SET DEFAULT 15;--> statement-breakpoint
ALTER TABLE "dealers" ADD COLUMN "sms_sender_name" text;--> statement-breakpoint
ALTER TABLE "dealers" ADD COLUMN "sms_notifications_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dealers" ADD COLUMN "notification_phone" text;--> statement-breakpoint
ALTER TABLE "booking_rules" ADD COLUMN "test_drive_minutes" integer DEFAULT 45 NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_rules" ADD COLUMN "viewing_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_rules" ADD COLUMN "other_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_rules" ADD COLUMN "capacity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "holiday_overrides" ADD COLUMN "open_anyway" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dealer_closures" ADD CONSTRAINT "dealer_closures_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dealer_closures_dealer_id_idx" ON "dealer_closures" USING btree ("dealer_id");--> statement-breakpoint
UPDATE "holiday_overrides" SET "open_anyway" = "is_open";--> statement-breakpoint
UPDATE "holiday_overrides" SET "opens_at" = NULL, "closes_at" = NULL WHERE NOT "is_open";--> statement-breakpoint
-- closures stored [starts_at, ends_at) instants; dealer_closures holds inclusive Ljubljana days.
INSERT INTO "dealer_closures" ("id", "dealer_id", "start_date", "end_date", "reason", "created_at")
SELECT left(replace(gen_random_uuid()::text, '-', ''), 16), "dealer_id", ("starts_at" AT TIME ZONE 'Europe/Ljubljana')::date, (("ends_at" - interval '1 microsecond') AT TIME ZONE 'Europe/Ljubljana')::date, nullif("reason", ''), "created_at" FROM "closures";--> statement-breakpoint
ALTER TABLE "closures" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "closures" CASCADE;--> statement-breakpoint
ALTER TABLE "holiday_overrides" DROP CONSTRAINT "holiday_overrides_open_hours";--> statement-breakpoint
ALTER TABLE "holiday_overrides" DROP COLUMN "is_open";--> statement-breakpoint
ALTER TABLE "holiday_overrides" ADD CONSTRAINT "holiday_overrides_hours_range" CHECK (("holiday_overrides"."opens_at" IS NULL AND "holiday_overrides"."closes_at" IS NULL) OR ("holiday_overrides"."opens_at" IS NOT NULL AND "holiday_overrides"."closes_at" IS NOT NULL AND "holiday_overrides"."opens_at" < "holiday_overrides"."closes_at"));