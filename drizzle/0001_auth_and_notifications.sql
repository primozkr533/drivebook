CREATE TYPE "public"."auth_surface" AS ENUM('dealer', 'backoffice');--> statement-breakpoint
CREATE TYPE "public"."auth_token_purpose" AS ENUM('invite', 'reset');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('invited', 'active', 'deactivated');--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"surface" "auth_surface" NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "auth_token_purpose" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "backoffice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "backoffice_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "dealer_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "dealer_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"surface" "auth_surface" NOT NULL,
	"email" text NOT NULL,
	"ip" text,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "message_channel" NOT NULL,
	"recipient" text NOT NULL,
	"sender" text NOT NULL,
	"subject" text,
	"text_body" text NOT NULL,
	"html_body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backoffice_users" ADD COLUMN "status" "user_status" DEFAULT 'invited' NOT NULL;--> statement-breakpoint
ALTER TABLE "backoffice_users" ADD COLUMN "totp_secret_enc" text;--> statement-breakpoint
ALTER TABLE "backoffice_users" ADD COLUMN "totp_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "backoffice_users" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dealer_users" ADD COLUMN "status" "user_status" DEFAULT 'invited' NOT NULL;--> statement-breakpoint
ALTER TABLE "dealer_users" ADD COLUMN "totp_secret_enc" text;--> statement-breakpoint
ALTER TABLE "dealer_users" ADD COLUMN "totp_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "message_log" ADD COLUMN "sms_segments" integer;--> statement-breakpoint
ALTER TABLE "backoffice_sessions" ADD CONSTRAINT "backoffice_sessions_user_id_backoffice_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."backoffice_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_sessions" ADD CONSTRAINT "dealer_sessions_user_id_dealer_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."dealer_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_tokens_surface_user_id_idx" ON "auth_tokens" USING btree ("surface","user_id");--> statement-breakpoint
CREATE INDEX "backoffice_sessions_user_id_idx" ON "backoffice_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dealer_sessions_user_id_idx" ON "dealer_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_attempts_surface_email_created_at_idx" ON "login_attempts" USING btree ("surface","email","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_surface_ip_created_at_idx" ON "login_attempts" USING btree ("surface","ip","created_at");--> statement-breakpoint
UPDATE "dealer_users" SET "status" = CASE WHEN "active" THEN 'active'::"user_status" ELSE 'deactivated'::"user_status" END;--> statement-breakpoint
UPDATE "backoffice_users" SET "status" = CASE WHEN "active" THEN 'active'::"user_status" ELSE 'deactivated'::"user_status" END;--> statement-breakpoint
UPDATE "dealer_users" SET "email" = lower("email") WHERE "email" <> lower("email");--> statement-breakpoint
UPDATE "backoffice_users" SET "email" = lower("email") WHERE "email" <> lower("email");--> statement-breakpoint
UPDATE "dealer_users" SET "role" = 'salesperson' WHERE "role" = 'manager';--> statement-breakpoint
UPDATE "message_log" SET "status" = 'sent' WHERE "status" = 'mocked';--> statement-breakpoint
ALTER TABLE "invitations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "password_resets" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "invitations" CASCADE;--> statement-breakpoint
DROP TABLE "password_resets" CASCADE;--> statement-breakpoint
DROP TABLE "sessions" CASCADE;--> statement-breakpoint
ALTER TABLE "dealer_users" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."dealer_role";--> statement-breakpoint
CREATE TYPE "public"."dealer_role" AS ENUM('owner', 'salesperson');--> statement-breakpoint
ALTER TABLE "dealer_users" ALTER COLUMN "role" SET DATA TYPE "public"."dealer_role" USING "role"::"public"."dealer_role";--> statement-breakpoint
ALTER TABLE "message_log" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "message_log" ALTER COLUMN "status" SET DEFAULT 'queued'::text;--> statement-breakpoint
DROP TYPE "public"."message_status";--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
ALTER TABLE "message_log" ALTER COLUMN "status" SET DEFAULT 'queued'::"public"."message_status";--> statement-breakpoint
ALTER TABLE "message_log" ALTER COLUMN "status" SET DATA TYPE "public"."message_status" USING "status"::"public"."message_status";--> statement-breakpoint
DROP INDEX "dealer_users_dealer_id_email_unique";--> statement-breakpoint
ALTER TABLE "backoffice_users" DROP COLUMN "active";--> statement-breakpoint
ALTER TABLE "dealer_users" DROP COLUMN "active";--> statement-breakpoint
ALTER TABLE "dealer_users" ADD CONSTRAINT "dealer_users_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "backoffice_users" ADD CONSTRAINT "backoffice_users_email_lowercase" CHECK ("backoffice_users"."email" = lower("backoffice_users"."email"));--> statement-breakpoint
ALTER TABLE "dealer_users" ADD CONSTRAINT "dealer_users_email_lowercase" CHECK ("dealer_users"."email" = lower("dealer_users"."email"));--> statement-breakpoint
DROP TYPE "public"."user_kind";