CREATE TABLE "device_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"pairing_id" uuid,
	"session_id" uuid,
	"event" text NOT NULL,
	"reason" text NOT NULL,
	"sequence" bigint,
	"observed_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_pairings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"identity" jsonb NOT NULL,
	"session_hash" text NOT NULL,
	"code_hash" text NOT NULL,
	"challenge" text NOT NULL,
	"capabilities" jsonb NOT NULL,
	"state" text NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	CONSTRAINT "device_pairing_state" CHECK ("device_pairings"."state" IN ('pending','exchanged','cancelled','expired','locked')),
	CONSTRAINT "device_pairing_failures" CHECK ("device_pairings"."failures" BETWEEN 0 AND 5),
	CONSTRAINT "device_pairing_secrets" CHECK ("device_pairings"."code_hash" ~ '^[a-f0-9]{64}$' AND "device_pairings"."challenge" ~ '^[a-f0-9]{64}$' AND "device_pairings"."session_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "device_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pairing_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"identity" jsonb NOT NULL,
	"session_hash" text NOT NULL,
	"token_hash" text NOT NULL,
	"capabilities" jsonb NOT NULL,
	"status" text NOT NULL,
	"last_sequence" bigint DEFAULT 0 NOT NULL,
	"last_seen_at" bigint,
	"presence_expires_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	CONSTRAINT "device_sessions_pairing_id_unique" UNIQUE("pairing_id"),
	CONSTRAINT "device_sessions_device_id_unique" UNIQUE("device_id"),
	CONSTRAINT "device_sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "device_session_status" CHECK ("device_sessions"."status" IN ('active','revoked','expired','disconnected')),
	CONSTRAINT "device_session_sequence" CHECK ("device_sessions"."last_sequence" BETWEEN 0 AND 9007199254740990),
	CONSTRAINT "device_session_secrets" CHECK ("device_sessions"."token_hash" ~ '^[a-f0-9]{64}$' AND "device_sessions"."session_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "device_audit" ADD CONSTRAINT "device_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_audit" ADD CONSTRAINT "device_audit_pairing_id_device_pairings_id_fk" FOREIGN KEY ("pairing_id") REFERENCES "public"."device_pairings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_audit" ADD CONSTRAINT "device_audit_session_id_device_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."device_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_pairings" ADD CONSTRAINT "device_pairings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_pairing_id_device_pairings_id_fk" FOREIGN KEY ("pairing_id") REFERENCES "public"."device_pairings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_audit_owner_page" ON "device_audit" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "device_pairing_owner" ON "device_pairings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "device_pairing_expiry" ON "device_pairings" USING btree ("state","expires_at");--> statement-breakpoint
CREATE INDEX "device_session_owner" ON "device_sessions" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "device_session_expiry" ON "device_sessions" USING btree ("status","presence_expires_at");--> statement-breakpoint
CREATE FUNCTION reject_device_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'device audit is append-only' USING ERRCODE='55000'; END; $$;
--> statement-breakpoint
CREATE TRIGGER immutable_device_audit BEFORE UPDATE OR DELETE OR TRUNCATE ON device_audit FOR EACH STATEMENT EXECUTE FUNCTION reject_device_audit_mutation();
