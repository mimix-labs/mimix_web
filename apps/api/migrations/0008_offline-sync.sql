CREATE TABLE "sync_attempts" (
	"session_id" uuid NOT NULL,
	"local_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	CONSTRAINT "sync_attempts_session_id_local_id_pk" PRIMARY KEY("session_id","local_id"),
	CONSTRAINT "sync_attempts_attempt_id_unique" UNIQUE("attempt_id")
);
--> statement-breakpoint
CREATE TABLE "sync_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"claim_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_claim_hash" CHECK ("sync_sessions"."claim_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "sync_attempts" ADD CONSTRAINT "sync_attempts_session_id_sync_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sync_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_attempts" ADD CONSTRAINT "sync_attempts_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_sessions" ADD CONSTRAINT "sync_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TRIGGER immutable_sync_sessions BEFORE UPDATE OR DELETE OR TRUNCATE ON sync_sessions
FOR EACH STATEMENT EXECUTE FUNCTION reject_learning_history_mutation();
--> statement-breakpoint
CREATE TRIGGER immutable_sync_attempts BEFORE UPDATE OR DELETE OR TRUNCATE ON sync_attempts
FOR EACH STATEMENT EXECUTE FUNCTION reject_learning_history_mutation();
