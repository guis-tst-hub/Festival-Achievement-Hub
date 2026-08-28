import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const claimEvents = sqliteTable("claim_events", {
  eventId: text("event_id").primaryKey(),
  status: text("status").notNull().default("closed"),
  configJson: text("config_json").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const claimRules = sqliteTable("claim_rules", {
  eventId: text("event_id").notNull(),
  achievementId: text("achievement_id").notNull(),
  claimCode: text("claim_code").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  maxClaims: integer("max_claims").notNull().default(100),
  claimedCount: integer("claimed_count").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.eventId, table.achievementId] }),
  uniqueIndex("idx_claim_rules_event_code").on(table.eventId, table.claimCode),
]);

export const claimRecords = sqliteTable("claim_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: text("event_id").notNull(),
  achievementId: text("achievement_id").notNull(),
  deviceHash: text("device_hash").notNull(),
  claimedAt: text("claimed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_claim_records_unique_device").on(
    table.eventId,
    table.achievementId,
    table.deviceHash,
  ),
  index("idx_claim_records_achievement").on(table.eventId, table.achievementId),
]);
