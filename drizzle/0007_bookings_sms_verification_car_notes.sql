CREATE TYPE "public"."booking_kind" AS ENUM('test_drive', 'viewing');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"dealer_id" uuid NOT NULL,
	"car_id" text NOT NULL,
	"kind" "booking_kind" NOT NULL,
	"status" "booking_status" DEFAULT 'confirmed' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_email" text,
	"customer_note" text,
	"code" text NOT NULL,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"verify_code_hash" text,
	"verify_expires_at" timestamp with time zone,
	"verify_attempts" integer DEFAULT 0 NOT NULL,
	"verify_sends" integer DEFAULT 0 NOT NULL,
	"verify_last_sent_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_valid_range" CHECK ("bookings"."ends_at" > "bookings"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "cars" ADD COLUMN "mileage_km" integer;--> statement-breakpoint
ALTER TABLE "cars" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_dealer_starts_idx" ON "bookings" USING btree ("dealer_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_car_starts_idx" ON "bookings" USING btree ("car_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_dealer_phone_created_idx" ON "bookings" USING btree ("dealer_id","customer_phone","created_at");--> statement-breakpoint
ALTER TABLE "booking_rules" DROP COLUMN "capacity";