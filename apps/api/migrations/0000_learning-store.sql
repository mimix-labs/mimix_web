CREATE TABLE "attempt_progress" (
	"attempt_id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"last_sequence" integer NOT NULL,
	"answers" integer NOT NULL,
	"correct_answers" integer NOT NULL,
	"hints" integer NOT NULL,
	CONSTRAINT "progress_counts" CHECK ("attempt_progress"."answers" >= 0 AND "attempt_progress"."correct_answers" BETWEEN 0 AND "attempt_progress"."answers" AND "attempt_progress"."hints" >= 0 AND "attempt_progress"."last_sequence" >= 1),
	CONSTRAINT "progress_status" CHECK ("attempt_progress"."status" IN ('active','completed','abandoned'))
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"challenge_id" text NOT NULL,
	"challenge_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempt_creation_key" UNIQUE("user_id","idempotency_key"),
	CONSTRAINT "challenge_reference" CHECK ("attempts"."challenge_id" ~ '^[A-Za-z0-9._-]{1,80}$' AND "attempts"."challenge_version" ~ '^[A-Za-z0-9._-]{1,80}$')
);
--> statement-breakpoint
CREATE TABLE "external_identities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	CONSTRAINT "external_identity_key" UNIQUE("provider","issuer","subject")
);
--> statement-breakpoint
CREATE TABLE "learning_events" (
	"attempt_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_events_attempt_id_event_id_pk" PRIMARY KEY("attempt_id","event_id"),
	CONSTRAINT "event_sequence" UNIQUE("attempt_id","sequence"),
	CONSTRAINT "event_sequence_bounds" CHECK ("learning_events"."sequence" BETWEEN 1 AND 1000000),
	CONSTRAINT "event_version" CHECK ("learning_events"."schema_version" = 1),
	CONSTRAINT "event_contract" CHECK (("learning_events"."type" = 'attempt_started' AND "learning_events"."sequence" = 1 AND "learning_events"."payload" = '{}'::jsonb) OR ("learning_events"."sequence" > 1 AND (("learning_events"."type" IN ('hint_requested','attempt_completed','attempt_abandoned') AND "learning_events"."payload" = '{}'::jsonb) OR ("learning_events"."type" = 'answer_submitted' AND jsonb_typeof("learning_events"."payload"->'correct') = 'boolean' AND "learning_events"."payload" - 'correct' = '{}'::jsonb))))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempt_progress" ADD CONSTRAINT "attempt_progress_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempt_owner_page" ON "attempts" USING btree ("user_id","id");