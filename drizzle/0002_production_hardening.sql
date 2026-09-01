CREATE TABLE IF NOT EXISTS "claim_rate_limits" (
  "rate_key" text PRIMARY KEY NOT NULL,
  "window_started_at" timestamptz DEFAULT now() NOT NULL,
  "attempt_count" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "claim_rate_limits_count_check" CHECK ("attempt_count" > 0)
);
--> statement-breakpoint
UPDATE "claim_events" SET "status" = 'closed' WHERE "status" NOT IN ('active', 'closed');
UPDATE "claim_rules" SET "max_claims" = GREATEST(1, LEAST(100000, "max_claims")), "claimed_count" = GREATEST(0, "claimed_count");
UPDATE "claim_rules" SET "max_claims" = "claimed_count" WHERE "claimed_count" > "max_claims";
DELETE FROM "claim_rules" r WHERE NOT EXISTS (SELECT 1 FROM "claim_events" e WHERE e."event_id" = r."event_id");
DELETE FROM "claim_records" c WHERE NOT EXISTS (
  SELECT 1 FROM "claim_rules" r WHERE r."event_id" = c."event_id" AND r."achievement_id" = c."achievement_id"
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "claim_events" ADD CONSTRAINT "claim_events_status_check" CHECK ("status" IN ('active', 'closed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "claim_rules" ADD CONSTRAINT "claim_rules_event_id_claim_events_event_id_fk"
    FOREIGN KEY ("event_id") REFERENCES "claim_events"("event_id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "claim_rules" ADD CONSTRAINT "claim_rules_max_claims_check" CHECK ("max_claims" BETWEEN 1 AND 100000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "claim_rules" ADD CONSTRAINT "claim_rules_claimed_count_check" CHECK ("claimed_count" BETWEEN 0 AND "max_claims");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "claim_records" ADD CONSTRAINT "claim_records_event_achievement_fk"
    FOREIGN KEY ("event_id", "achievement_id") REFERENCES "claim_rules"("event_id", "achievement_id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
