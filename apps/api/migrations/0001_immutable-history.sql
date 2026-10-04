-- Attempts identify immutable streams; mutable state lives only in the projection.
CREATE FUNCTION reject_learning_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'learning history is append-only' USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER immutable_events BEFORE UPDATE OR DELETE OR TRUNCATE ON learning_events
FOR EACH STATEMENT EXECUTE FUNCTION reject_learning_history_mutation();
--> statement-breakpoint
CREATE TRIGGER immutable_attempts BEFORE UPDATE OR DELETE OR TRUNCATE ON attempts
FOR EACH STATEMENT EXECUTE FUNCTION reject_learning_history_mutation();
