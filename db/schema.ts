import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const claimEvents = pgTable("claim_events", {
  eventId: text("event_id").primaryKey(),
  status: text("status").notNull().default("closed"),
  configJson: text("config_json").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [check("claim_events_status_check", sql`${table.status} IN ('active', 'closed')`)]);

export const claimRules = pgTable("claim_rules", {
  eventId: text("event_id").notNull().references(() => claimEvents.eventId, { onDelete: "cascade" }),
  achievementId: text("achievement_id").notNull(),
  claimCode: text("claim_code").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  maxClaims: integer("max_claims").notNull().default(100),
  claimedCount: integer("claimed_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.eventId, table.achievementId] }),
  uniqueIndex("idx_claim_rules_event_code").on(table.eventId, table.claimCode),
  check("claim_rules_max_claims_check", sql`${table.maxClaims} BETWEEN 1 AND 100000`),
  check("claim_rules_claimed_count_check", sql`${table.claimedCount} BETWEEN 0 AND ${table.maxClaims}`),
]);

export const claimRecords = pgTable("claim_records", {
  id: serial("id").primaryKey(),
  eventId: text("event_id").notNull(),
  achievementId: text("achievement_id").notNull(),
  deviceHash: text("device_hash").notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.eventId, table.achievementId], foreignColumns: [claimRules.eventId, claimRules.achievementId] }).onDelete("cascade"),
  uniqueIndex("idx_claim_records_unique_device").on(table.eventId, table.achievementId, table.deviceHash),
  index("idx_claim_records_achievement").on(table.eventId, table.achievementId),
]);

export const claimRateLimits = pgTable("claim_rate_limits", {
  rateKey: text("rate_key").primaryKey(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
  attemptCount: integer("attempt_count").notNull().default(1),
}, (table) => [check("claim_rate_limits_count_check", sql`${table.attemptCount} > 0`)]);
