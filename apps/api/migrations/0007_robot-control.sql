CREATE TABLE "robot_commands" (
	"sequence" bigserial PRIMARY KEY NOT NULL,
	"id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"control_session_id" uuid NOT NULL,
	"behavior" text NOT NULL,
	"ttl_ms" integer NOT NULL,
	"envelope" jsonb NOT NULL,
	"internal" integer DEFAULT 0 NOT NULL,
	"state" text NOT NULL,
	"reason" text NOT NULL,
	"issued_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	CONSTRAINT "robot_command_idempotency" UNIQUE("user_id","id"),
	CONSTRAINT "robot_command_state" CHECK ("robot_commands"."state" IN ('prepared','published','accepted','rejected','unknown','cancelled')),
	CONSTRAINT "robot_command_limits" CHECK ("robot_commands"."sequence" BETWEEN 1 AND 9007199254740990 AND "robot_commands"."ttl_ms" BETWEEN 1 AND 2000 AND "robot_commands"."expires_at" > "robot_commands"."issued_at" AND "robot_commands"."expires_at" - "robot_commands"."issued_at" <= "robot_commands"."ttl_ms"),
	CONSTRAINT "robot_command_behavior" CHECK ("robot_commands"."behavior" IN ('greet','celebrate','attend','stop') AND "robot_commands"."internal" IN (0,1))
);
--> statement-breakpoint
CREATE TABLE "robot_control_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"control_session_id" uuid NOT NULL,
	"command_id" uuid,
	"event" text NOT NULL,
	"reason" text NOT NULL,
	"observed_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "robot_control_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_session_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"lease_id" uuid NOT NULL,
	"state" text NOT NULL,
	"reason" text NOT NULL,
	"expires_at" bigint NOT NULL,
	CONSTRAINT "robot_control_state" CHECK ("robot_control_sessions"."state" IN ('active','closed'))
);
--> statement-breakpoint
ALTER TABLE "robot_commands" ADD CONSTRAINT "robot_commands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "robot_commands" ADD CONSTRAINT "robot_commands_control_session_id_robot_control_sessions_id_fk" FOREIGN KEY ("control_session_id") REFERENCES "public"."robot_control_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "robot_control_audit" ADD CONSTRAINT "robot_control_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "robot_control_audit" ADD CONSTRAINT "robot_control_audit_control_session_id_robot_control_sessions_id_fk" FOREIGN KEY ("control_session_id") REFERENCES "public"."robot_control_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "robot_control_sessions" ADD CONSTRAINT "robot_control_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "robot_control_sessions" ADD CONSTRAINT "robot_control_sessions_device_session_id_device_sessions_id_fk" FOREIGN KEY ("device_session_id") REFERENCES "public"."device_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "robot_command_pending" ON "robot_commands" USING btree ("state","expires_at");--> statement-breakpoint
CREATE INDEX "robot_control_audit_owner_page" ON "robot_control_audit" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "robot_control_owner_active" ON "robot_control_sessions" USING btree ("user_id") WHERE "robot_control_sessions"."state" = 'active';--> statement-breakpoint
CREATE INDEX "robot_control_active" ON "robot_control_sessions" USING btree ("state","id");--> statement-breakpoint
CREATE FUNCTION reject_robot_control_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'robot control audit is append-only' USING ERRCODE='55000'; END; $$;
--> statement-breakpoint
CREATE TRIGGER immutable_robot_control_audit BEFORE UPDATE OR DELETE OR TRUNCATE ON robot_control_audit FOR EACH STATEMENT EXECUTE FUNCTION reject_robot_control_audit_mutation();
