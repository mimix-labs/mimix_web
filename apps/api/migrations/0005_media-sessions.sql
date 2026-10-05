CREATE TABLE "media_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"device_session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"tracks" jsonb NOT NULL,
	"state" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	CONSTRAINT "media_session_state" CHECK ("media_sessions"."state" IN ('active','closing','closed'))
);
--> statement-breakpoint
ALTER TABLE "media_sessions" ADD CONSTRAINT "media_sessions_device_session_id_device_sessions_id_fk" FOREIGN KEY ("device_session_id") REFERENCES "public"."device_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_sessions" ADD CONSTRAINT "media_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_session_owner" ON "media_sessions" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "media_session_cleanup" ON "media_sessions" USING btree ("state","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_device_open" ON "media_sessions" USING btree ("device_session_id") WHERE "media_sessions"."state" <> 'closed';