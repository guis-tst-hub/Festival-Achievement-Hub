CREATE TABLE `claim_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'closed' NOT NULL,
	`config_json` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `claim_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`achievement_id` text NOT NULL,
	`device_hash` text NOT NULL,
	`claimed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_claim_records_unique_device` ON `claim_records` (`event_id`,`achievement_id`,`device_hash`);--> statement-breakpoint
CREATE INDEX `idx_claim_records_achievement` ON `claim_records` (`event_id`,`achievement_id`);--> statement-breakpoint
CREATE TABLE `claim_rules` (
	`event_id` text NOT NULL,
	`achievement_id` text NOT NULL,
	`claim_code` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`icon` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`max_claims` integer DEFAULT 100 NOT NULL,
	`claimed_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`event_id`, `achievement_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_claim_rules_event_code` ON `claim_rules` (`event_id`,`claim_code`);
--> statement-breakpoint
CREATE TRIGGER `claim_records_guard`
BEFORE INSERT ON `claim_records`
FOR EACH ROW
BEGIN
	SELECT CASE WHEN NOT EXISTS (
		SELECT 1 FROM `claim_events`
		WHERE `event_id` = NEW.`event_id` AND `status` = 'active'
	) THEN RAISE(ABORT, 'event_closed') END;
	SELECT CASE WHEN NOT EXISTS (
		SELECT 1 FROM `claim_rules`
		WHERE `event_id` = NEW.`event_id`
			AND `achievement_id` = NEW.`achievement_id`
			AND `enabled` = 1
	) THEN RAISE(ABORT, 'achievement_disabled') END;
	SELECT CASE WHEN EXISTS (
		SELECT 1 FROM `claim_rules`
		WHERE `event_id` = NEW.`event_id`
			AND `achievement_id` = NEW.`achievement_id`
			AND `claimed_count` >= `max_claims`
	) THEN RAISE(ABORT, 'claim_limit_reached') END;
END;
--> statement-breakpoint
CREATE TRIGGER `claim_records_increment`
AFTER INSERT ON `claim_records`
FOR EACH ROW
BEGIN
	UPDATE `claim_rules`
	SET `claimed_count` = `claimed_count` + 1,
		`updated_at` = CURRENT_TIMESTAMP
	WHERE `event_id` = NEW.`event_id`
		AND `achievement_id` = NEW.`achievement_id`;
END;
--> statement-breakpoint
PRAGMA optimize;
