CREATE TABLE "password_reset_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"surface" "auth_surface" NOT NULL,
	"ip" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backoffice_users" ADD COLUMN "totp_last_step" bigint;--> statement-breakpoint
ALTER TABLE "dealer_users" ADD COLUMN "totp_last_step" bigint;--> statement-breakpoint
CREATE INDEX "password_reset_requests_surface_ip_created_at_idx" ON "password_reset_requests" USING btree ("surface","ip","created_at");