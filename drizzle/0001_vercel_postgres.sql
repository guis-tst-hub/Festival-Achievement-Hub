CREATE TABLE IF NOT EXISTS "claim_events" (
  "event_id" text PRIMARY KEY NOT NULL,
  "status" text DEFAULT 'closed' NOT NULL,
  "config_json" text NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "claim_rules" (
  "event_id" text NOT NULL,
  "achievement_id" text NOT NULL,
  "claim_code" text NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "icon" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "max_claims" integer DEFAULT 100 NOT NULL,
  "claimed_count" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "claim_rules_event_id_achievement_id_pk" PRIMARY KEY("event_id", "achievement_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "claim_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "event_id" text NOT NULL,
  "achievement_id" text NOT NULL,
  "device_hash" text NOT NULL,
  "claimed_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_claim_rules_event_code" ON "claim_rules" ("event_id", "claim_code");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_claim_records_unique_device" ON "claim_records" ("event_id", "achievement_id", "device_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_claim_records_achievement" ON "claim_records" ("event_id", "achievement_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION claim_achievement(p_event_id text, p_claim_code text, p_device_hash text)
RETURNS TABLE(result_status text, achievement_id text, achievement_name text, achievement_description text,
  achievement_icon text, result_claimed_count integer, result_max_claims integer)
LANGUAGE plpgsql AS $$
DECLARE selected_rule claim_rules%ROWTYPE; event_status text;
BEGIN
  SELECT r, e.status INTO selected_rule, event_status
  FROM claim_rules r JOIN claim_events e ON e.event_id = r.event_id
  WHERE r.event_id = p_event_id AND r.claim_code = p_claim_code FOR UPDATE OF r;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found', NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer, NULL::integer; RETURN; END IF;
  achievement_id := selected_rule.achievement_id; achievement_name := selected_rule.name;
  achievement_description := selected_rule.description; achievement_icon := selected_rule.icon;
  result_claimed_count := selected_rule.claimed_count; result_max_claims := selected_rule.max_claims;
  IF EXISTS (SELECT 1 FROM claim_records WHERE event_id = p_event_id AND claim_records.achievement_id = selected_rule.achievement_id AND device_hash = p_device_hash) THEN
    result_status := 'already'; RETURN NEXT; RETURN;
  END IF;
  IF event_status <> 'active' THEN result_status := 'event_closed'; RETURN NEXT; RETURN; END IF;
  IF NOT selected_rule.enabled THEN result_status := 'achievement_disabled'; RETURN NEXT; RETURN; END IF;
  IF selected_rule.claimed_count >= selected_rule.max_claims THEN result_status := 'limit_reached'; RETURN NEXT; RETURN; END IF;
  INSERT INTO claim_records (event_id, achievement_id, device_hash) VALUES (p_event_id, selected_rule.achievement_id, p_device_hash);
  UPDATE claim_rules SET claimed_count = claimed_count + 1, updated_at = CURRENT_TIMESTAMP
    WHERE event_id = p_event_id AND claim_rules.achievement_id = selected_rule.achievement_id RETURNING claimed_count INTO result_claimed_count;
  result_status := 'claimed'; RETURN NEXT;
END;
$$;
