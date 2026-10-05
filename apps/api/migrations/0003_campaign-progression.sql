CREATE TABLE "campaign_attempts" (
	"attempt_id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"campaign_version" text NOT NULL,
	"node_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_versions" (
	"id" text NOT NULL,
	"version" text NOT NULL,
	"title" text NOT NULL,
	"definition" jsonb NOT NULL,
	CONSTRAINT "campaign_versions_id_version_pk" PRIMARY KEY("id","version")
);
--> statement-breakpoint
ALTER TABLE "campaign_attempts" ADD CONSTRAINT "campaign_attempts_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_attempts" ADD CONSTRAINT "campaign_attempts_campaign_id_campaign_version_campaign_versions_id_version_fk" FOREIGN KEY ("campaign_id","campaign_version") REFERENCES "public"."campaign_versions"("id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_attempt_scope" ON "campaign_attempts" USING btree ("campaign_id","campaign_version","attempt_id");
--> statement-breakpoint
CREATE TRIGGER immutable_campaign_versions BEFORE UPDATE OR DELETE OR TRUNCATE ON campaign_versions
FOR EACH STATEMENT EXECUTE FUNCTION reject_learning_history_mutation();
--> statement-breakpoint
CREATE TRIGGER immutable_campaign_attempts BEFORE UPDATE OR DELETE OR TRUNCATE ON campaign_attempts
FOR EACH STATEMENT EXECUTE FUNCTION reject_learning_history_mutation();
--> statement-breakpoint
CREATE FUNCTION check_campaign_attempt_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM campaign_versions c
    CROSS JOIN LATERAL jsonb_array_elements(c.definition->'nodes') n
    JOIN attempts a ON a.id = NEW.attempt_id
    WHERE c.id = NEW.campaign_id AND c.version = NEW.campaign_version
      AND n->>'id' = NEW.node_id AND n->>'challengeId' = a.challenge_id
      AND n->>'challengeVersion' = a.challenge_version
  ) THEN
    RAISE EXCEPTION 'invalid campaign attempt reference' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER campaign_attempt_reference BEFORE INSERT ON campaign_attempts
FOR EACH ROW EXECUTE FUNCTION check_campaign_attempt_reference();
