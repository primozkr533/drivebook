ALTER TYPE "public"."booking_status" ADD VALUE 'pending' BEFORE 'confirmed';--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "phone_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "verify_code_hash" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "verify_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "verify_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "verify_sends" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "verify_last_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "bookings_dealer_phone_created_idx" ON "bookings" USING btree ("dealer_id","customer_phone","created_at");--> statement-breakpoint
ALTER TABLE "booking_rules" DROP COLUMN "capacity";