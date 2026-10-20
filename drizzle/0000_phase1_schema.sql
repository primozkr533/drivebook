CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
CREATE TYPE "public"."backoffice_role" AS ENUM('superadmin', 'support');--> statement-breakpoint
CREATE TYPE "public"."car_body" AS ENUM('estate', 'sedan', 'suv');--> statement-breakpoint
CREATE TYPE "public"."dealer_role" AS ENUM('owner', 'manager', 'salesperson');--> statement-breakpoint
CREATE TYPE "public"."dealer_status" AS ENUM('active', 'suspended', 'read_only');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('sms', 'email');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'sent', 'failed', 'mocked');--> statement-breakpoint
CREATE TYPE "public"."user_kind" AS ENUM('dealer', 'backoffice');--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"max_cars" integer NOT NULL,
	"max_users" integer NOT NULL,
	"sms_included" integer NOT NULL,
	"price_eur_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "dealer_licence_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dealer_licence_history_valid_range" CHECK ("dealer_licence_history"."valid_to" IS NULL OR "dealer_licence_history"."valid_from" < "dealer_licence_history"."valid_to")
);
--> statement-breakpoint
CREATE TABLE "dealer_slug_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"replaced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dealer_slug_history_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "dealers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text NOT NULL,
	"address_line" text NOT NULL,
	"postal_code" text NOT NULL,
	"city" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"website_url" text,
	"maps_url" text,
	"privacy_url" text,
	"primary_color" text NOT NULL,
	"logo_key" text,
	"plan_id" uuid NOT NULL,
	"status" "dealer_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dealers_slug_unique" UNIQUE("slug"),
	CONSTRAINT "dealers_primary_color_hex" CHECK ("dealers"."primary_color" ~ '^#[0-9A-Fa-f]{6}$')
);
--> statement-breakpoint
CREATE TABLE "backoffice_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "backoffice_role" NOT NULL,
	"password_hash" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backoffice_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "dealer_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "dealer_role" NOT NULL,
	"password_hash" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "dealer_role" NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_kind" "user_kind" NOT NULL,
	"dealer_user_id" uuid,
	"backoffice_user_id" uuid,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "password_resets_user_matches_kind" CHECK (("password_resets"."user_kind" = 'dealer' AND "password_resets"."dealer_user_id" IS NOT NULL AND "password_resets"."backoffice_user_id" IS NULL) OR ("password_resets"."user_kind" = 'backoffice' AND "password_resets"."backoffice_user_id" IS NOT NULL AND "password_resets"."dealer_user_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_kind" "user_kind" NOT NULL,
	"dealer_user_id" uuid,
	"backoffice_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_user_matches_kind" CHECK (("sessions"."user_kind" = 'dealer' AND "sessions"."dealer_user_id" IS NOT NULL AND "sessions"."backoffice_user_id" IS NULL) OR ("sessions"."user_kind" = 'backoffice' AND "sessions"."backoffice_user_id" IS NOT NULL AND "sessions"."dealer_user_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "booking_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"slot_minutes" integer DEFAULT 30 NOT NULL,
	"lead_time_minutes" integer DEFAULT 120 NOT NULL,
	"max_days_ahead" integer DEFAULT 30 NOT NULL,
	"cancel_cutoff_minutes" integer DEFAULT 120 NOT NULL,
	"buffer_minutes" integer DEFAULT 0 NOT NULL,
	"require_phone_verification" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_rules_dealer_id_unique" UNIQUE("dealer_id")
);
--> statement-breakpoint
CREATE TABLE "closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "closures_valid_range" CHECK ("closures"."starts_at" < "closures"."ends_at")
);
--> statement-breakpoint
CREATE TABLE "holiday_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"is_open" boolean NOT NULL,
	"opens_at" time,
	"closes_at" time,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holiday_overrides_dealer_date_unique" UNIQUE("dealer_id","date"),
	CONSTRAINT "holiday_overrides_open_hours" CHECK (NOT "holiday_overrides"."is_open" OR ("holiday_overrides"."opens_at" IS NOT NULL AND "holiday_overrides"."closes_at" IS NOT NULL AND "holiday_overrides"."opens_at" < "holiday_overrides"."closes_at"))
);
--> statement-breakpoint
CREATE TABLE "opening_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"iso_weekday" smallint NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opening_hours_dealer_weekday_opens_unique" UNIQUE("dealer_id","iso_weekday","opens_at"),
	CONSTRAINT "opening_hours_iso_weekday_range" CHECK ("opening_hours"."iso_weekday" BETWEEN 1 AND 7),
	CONSTRAINT "opening_hours_opens_before_closes" CHECK ("opening_hours"."opens_at" < "opening_hours"."closes_at")
);
--> statement-breakpoint
CREATE TABLE "cars" (
	"id" text PRIMARY KEY NOT NULL,
	"dealer_id" uuid NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"trim" text,
	"year" integer NOT NULL,
	"price_eur" integer NOT NULL,
	"body" "car_body" NOT NULL,
	"avto_net_url" text NOT NULL,
	"image_key" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cars_dealer_avto_net_url_unique" UNIQUE("dealer_id","avto_net_url")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid,
	"actor_kind" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid,
	"channel" "message_channel" NOT NULL,
	"provider" text NOT NULL,
	"recipient" text NOT NULL,
	"template" text NOT NULL,
	"status" "message_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dealer_licence_history" ADD CONSTRAINT "dealer_licence_history_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_licence_history" ADD CONSTRAINT "dealer_licence_history_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_slug_history" ADD CONSTRAINT "dealer_slug_history_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealers" ADD CONSTRAINT "dealers_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_users" ADD CONSTRAINT "dealer_users_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_dealer_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."dealer_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_dealer_user_id_dealer_users_id_fk" FOREIGN KEY ("dealer_user_id") REFERENCES "public"."dealer_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_backoffice_user_id_backoffice_users_id_fk" FOREIGN KEY ("backoffice_user_id") REFERENCES "public"."backoffice_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_dealer_user_id_dealer_users_id_fk" FOREIGN KEY ("dealer_user_id") REFERENCES "public"."dealer_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_backoffice_user_id_backoffice_users_id_fk" FOREIGN KEY ("backoffice_user_id") REFERENCES "public"."backoffice_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_rules" ADD CONSTRAINT "booking_rules_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closures" ADD CONSTRAINT "closures_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday_overrides" ADD CONSTRAINT "holiday_overrides_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_hours" ADD CONSTRAINT "opening_hours_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "cars_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_log" ADD CONSTRAINT "message_log_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dealer_licence_history_dealer_id_idx" ON "dealer_licence_history" USING btree ("dealer_id");--> statement-breakpoint
CREATE INDEX "dealer_slug_history_dealer_id_idx" ON "dealer_slug_history" USING btree ("dealer_id");--> statement-breakpoint
CREATE INDEX "dealers_plan_id_idx" ON "dealers" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "dealer_users_dealer_id_idx" ON "dealer_users" USING btree ("dealer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dealer_users_dealer_id_email_unique" ON "dealer_users" USING btree ("dealer_id",lower("email"));--> statement-breakpoint
CREATE INDEX "invitations_dealer_id_idx" ON "invitations" USING btree ("dealer_id");--> statement-breakpoint
CREATE INDEX "password_resets_dealer_user_id_idx" ON "password_resets" USING btree ("dealer_user_id");--> statement-breakpoint
CREATE INDEX "password_resets_backoffice_user_id_idx" ON "password_resets" USING btree ("backoffice_user_id");--> statement-breakpoint
CREATE INDEX "sessions_dealer_user_id_idx" ON "sessions" USING btree ("dealer_user_id");--> statement-breakpoint
CREATE INDEX "sessions_backoffice_user_id_idx" ON "sessions" USING btree ("backoffice_user_id");--> statement-breakpoint
CREATE INDEX "closures_dealer_id_idx" ON "closures" USING btree ("dealer_id");--> statement-breakpoint
CREATE INDEX "holiday_overrides_dealer_id_idx" ON "holiday_overrides" USING btree ("dealer_id");--> statement-breakpoint
CREATE INDEX "opening_hours_dealer_id_idx" ON "opening_hours" USING btree ("dealer_id");--> statement-breakpoint
CREATE INDEX "cars_dealer_id_idx" ON "cars" USING btree ("dealer_id");--> statement-breakpoint
CREATE INDEX "audit_log_dealer_id_idx" ON "audit_log" USING btree ("dealer_id");--> statement-breakpoint
CREATE INDEX "message_log_dealer_id_idx" ON "message_log" USING btree ("dealer_id");--> statement-breakpoint
-- Not expressible in Drizzle; mirrored by a comment on dealerLicenceHistory in src/db/schema/dealers.ts.
ALTER TABLE "dealer_licence_history" ADD CONSTRAINT "dealer_licence_history_no_overlap" EXCLUDE USING gist ("dealer_id" WITH =, tstzrange("valid_from", coalesce("valid_to", 'infinity')) WITH &&);
