import { env } from "cloudflare:workers";
import { defaultFestivalConfig, type FestivalConfig } from "../app/lib/demo-store";

export type ClaimRuleStat = {
  achievementId: string;
  claimCode: string;
  claimedCount: number;
  maxClaims: number;
  enabled: boolean;
};

export type FestivalSummary = {
  eventId: string;
  name: string;
  eyebrow: string;
  subtitle: string;
  dateLabel: string;
  status: FestivalConfig["status"];
  updatedAt: string;
};

export type NewFestivalInput = {
  eventId: string;
  name: string;
  eyebrow: string;
  subtitle: string;
  dateLabel: string;
};

export class FestivalAlreadyExistsError extends Error {}

export type OnlineClaimResult = {
  status: "claimed" | "already" | "event_closed" | "achievement_disabled" | "limit_reached" | "not_found";
  achievement?: {
    id: string;
    name: string;
    description: string;
    icon: string;
  };
  claimedCount?: number;
  maxClaims?: number;
};

let schemaReady: Promise<void> | null = null;

function getD1() {
  if (!env.DB) throw new Error("D1 binding `DB` is unavailable");
  return env.DB;
}

export async function ensureClaimSchema() {
  if (schemaReady) return schemaReady;
  const db = getD1();
  schemaReady = db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS claim_events (
      event_id TEXT PRIMARY KEY NOT NULL,
      status TEXT NOT NULL DEFAULT 'closed',
      config_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS claim_rules (
      event_id TEXT NOT NULL,
      achievement_id TEXT NOT NULL,
      claim_code TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      max_claims INTEGER NOT NULL DEFAULT 100,
      claimed_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (event_id, achievement_id)
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_claim_rules_event_code ON claim_rules(event_id, claim_code)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS claim_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      event_id TEXT NOT NULL,
      achievement_id TEXT NOT NULL,
      device_hash TEXT NOT NULL,
      claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_claim_records_unique_device ON claim_records(event_id, achievement_id, device_hash)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_claim_records_achievement ON claim_records(event_id, achievement_id)"),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS claim_records_guard
      BEFORE INSERT ON claim_records
      FOR EACH ROW
      BEGIN
        SELECT CASE WHEN NOT EXISTS (
          SELECT 1 FROM claim_events WHERE event_id = NEW.event_id AND status = 'active'
        ) THEN RAISE(ABORT, 'event_closed') END;
        SELECT CASE WHEN NOT EXISTS (
          SELECT 1 FROM claim_rules
          WHERE event_id = NEW.event_id AND achievement_id = NEW.achievement_id AND enabled = 1
        ) THEN RAISE(ABORT, 'achievement_disabled') END;
        SELECT CASE WHEN EXISTS (
          SELECT 1 FROM claim_rules
          WHERE event_id = NEW.event_id AND achievement_id = NEW.achievement_id
            AND claimed_count >= max_claims
        ) THEN RAISE(ABORT, 'claim_limit_reached') END;
      END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS claim_records_increment
      AFTER INSERT ON claim_records
      FOR EACH ROW
      BEGIN
        UPDATE claim_rules
        SET claimed_count = claimed_count + 1, updated_at = CURRENT_TIMESTAMP
        WHERE event_id = NEW.event_id AND achievement_id = NEW.achievement_id;
      END`),
  ]).then(() => undefined).catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

function normalizeConfig(config: FestivalConfig): FestivalConfig {
  return {
    ...config,
    achievements: config.achievements.map((achievement) => ({
      ...achievement,
      claimLimit: Math.max(1, Math.min(100000, Math.floor(achievement.claimLimit || 100))),
    })),
  };
}

export async function seedDefaultFestival() {
  await ensureClaimSchema();
  const db = getD1();
  const config = normalizeConfig(defaultFestivalConfig);
  const statements = [
    db.prepare("INSERT OR IGNORE INTO claim_events (event_id, status, config_json) VALUES (?, ?, ?)")
      .bind(config.eventId, config.status, JSON.stringify(config)),
    ...config.achievements.map((achievement) =>
      db.prepare(`INSERT OR IGNORE INTO claim_rules (
        event_id, achievement_id, claim_code, name, description, icon, enabled, max_claims
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          config.eventId,
          achievement.id,
          achievement.claimCode,
          achievement.name,
          achievement.description,
          achievement.icon,
          achievement.enabled ? 1 : 0,
          achievement.claimLimit,
        ),
    ),
  ];
  await db.batch(statements);
}

export async function syncFestivalConfig(input: FestivalConfig) {
  await ensureClaimSchema();
  const db = getD1();
  const config = normalizeConfig(input);
  const statements = [
    db.prepare(`INSERT INTO claim_events (event_id, status, config_json, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(event_id) DO UPDATE SET
        status = excluded.status,
        config_json = excluded.config_json,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(config.eventId, config.status, JSON.stringify(config)),
    db.prepare(`UPDATE claim_rules SET enabled = 0, updated_at = CURRENT_TIMESTAMP
      WHERE event_id = ?`)
      .bind(config.eventId),
    ...config.achievements.map((achievement) =>
      db.prepare(`INSERT INTO claim_rules (
        event_id, achievement_id, claim_code, name, description, icon, enabled, max_claims, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(event_id, achievement_id) DO UPDATE SET
        claim_code = excluded.claim_code,
        name = excluded.name,
        description = excluded.description,
        icon = excluded.icon,
        enabled = excluded.enabled,
        max_claims = excluded.max_claims,
        updated_at = CURRENT_TIMESTAMP`)
        .bind(
          config.eventId,
          achievement.id,
          achievement.claimCode,
          achievement.name,
          achievement.description,
          achievement.icon,
          achievement.enabled ? 1 : 0,
          achievement.claimLimit,
        ),
    ),
  ];
  await db.batch(statements);
  return config;
}

export async function loadFestivalConfigFromServer(eventId: string) {
  await ensureClaimSchema();
  if (eventId === defaultFestivalConfig.eventId) await seedDefaultFestival();
  const row = await getD1()
    .prepare("SELECT config_json FROM claim_events WHERE event_id = ?")
    .bind(eventId)
    .first<{ config_json: string }>();
  if (!row) return null;
  return normalizeConfig(JSON.parse(row.config_json) as FestivalConfig);
}

export async function loadActiveFestivalFromServer() {
  await ensureClaimSchema();
  await seedDefaultFestival();
  const row = await getD1()
    .prepare(`SELECT config_json FROM claim_events
      WHERE status = 'active'
      ORDER BY updated_at DESC, event_id ASC
      LIMIT 1`)
    .first<{ config_json: string }>();
  if (!row) return null;
  return normalizeConfig(JSON.parse(row.config_json) as FestivalConfig);
}

export async function listFestivals(): Promise<FestivalSummary[]> {
  await ensureClaimSchema();
  await seedDefaultFestival();
  const rows = await getD1()
    .prepare(`SELECT event_id, status, config_json, updated_at
      FROM claim_events ORDER BY updated_at DESC, event_id ASC`)
    .all<{
      event_id: string;
      status: string;
      config_json: string;
      updated_at: string;
    }>();

  return rows.results.flatMap((row) => {
    try {
      const config = normalizeConfig(JSON.parse(row.config_json) as FestivalConfig);
      return [{
        eventId: row.event_id,
        name: config.name,
        eyebrow: config.eyebrow,
        subtitle: config.subtitle,
        dateLabel: config.dateLabel,
        status: row.status === "active" ? "active" as const : "closed" as const,
        updatedAt: row.updated_at,
      }];
    } catch {
      return [];
    }
  });
}

export async function createFestival(input: NewFestivalInput): Promise<FestivalConfig> {
  await ensureClaimSchema();
  const eventId = input.eventId.trim().toLowerCase();
  const name = input.name.trim();
  const eyebrow = input.eyebrow.trim();
  const subtitle = input.subtitle.trim();
  const dateLabel = input.dateLabel.trim();

  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(eventId)) {
    throw new TypeError("活动编号必须为3到64位小写字母、数字或连字符");
  }
  if (!name || name.length > 80) throw new TypeError("活动名称必须为1到80个字符");
  if (!eyebrow || eyebrow.length > 80) throw new TypeError("活动标记必须为1到80个字符");
  if (!subtitle || subtitle.length > 240) throw new TypeError("活动说明必须为1到240个字符");
  if (!dateLabel || dateLabel.length > 80) throw new TypeError("活动时间必须为1到80个字符");

  const config: FestivalConfig = {
    eventId,
    name,
    eyebrow,
    subtitle,
    dateLabel,
    status: "closed",
    categories: [],
    achievements: [],
  };

  try {
    await getD1()
      .prepare(`INSERT INTO claim_events (event_id, status, config_json, updated_at)
        VALUES (?, 'closed', ?, CURRENT_TIMESTAMP)`)
      .bind(eventId, JSON.stringify(config))
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE") || message.includes("constraint")) {
      throw new FestivalAlreadyExistsError("这个活动编号已经存在");
    }
    throw error;
  }

  return config;
}

export async function getClaimStats(eventId: string): Promise<ClaimRuleStat[]> {
  await ensureClaimSchema();
  if (eventId === defaultFestivalConfig.eventId) await seedDefaultFestival();
  const rows = await getD1()
    .prepare(`SELECT achievement_id, claim_code, claimed_count, max_claims, enabled
      FROM claim_rules WHERE event_id = ? ORDER BY achievement_id`)
    .bind(eventId)
    .all<{
      achievement_id: string;
      claim_code: string;
      claimed_count: number;
      max_claims: number;
      enabled: number;
    }>();
  return rows.results.map((row) => ({
    achievementId: row.achievement_id,
    claimCode: row.claim_code,
    claimedCount: row.claimed_count,
    maxClaims: row.max_claims,
    enabled: Boolean(row.enabled),
  }));
}

async function hashDeviceId(eventId: string, deviceId: string) {
  const bytes = new TextEncoder().encode(`${eventId}:${deviceId}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function claimOnline(eventId: string, claimCode: string, deviceId: string): Promise<OnlineClaimResult> {
  await ensureClaimSchema();
  if (eventId === defaultFestivalConfig.eventId) await seedDefaultFestival();
  const db = getD1();
  const rule = await db.prepare(`SELECT
      r.achievement_id, r.name, r.description, r.icon, r.enabled,
      r.max_claims, r.claimed_count, e.status AS event_status
    FROM claim_rules r
    JOIN claim_events e ON e.event_id = r.event_id
    WHERE r.event_id = ? AND r.claim_code = ?`)
    .bind(eventId, claimCode)
    .first<{
      achievement_id: string;
      name: string;
      description: string;
      icon: string;
      enabled: number;
      max_claims: number;
      claimed_count: number;
      event_status: string;
    }>();

  if (!rule) return { status: "not_found" };
  const achievement = {
    id: rule.achievement_id,
    name: rule.name,
    description: rule.description,
    icon: rule.icon,
  };
  const deviceHash = await hashDeviceId(eventId, deviceId);
  const existing = await db.prepare(`SELECT id FROM claim_records
      WHERE event_id = ? AND achievement_id = ? AND device_hash = ?`)
    .bind(eventId, rule.achievement_id, deviceHash)
    .first();
  if (existing) {
    return {
      status: "already",
      achievement,
      claimedCount: rule.claimed_count,
      maxClaims: rule.max_claims,
    };
  }
  if (rule.event_status !== "active") return { status: "event_closed", achievement };
  if (!rule.enabled) return { status: "achievement_disabled", achievement };
  if (rule.claimed_count >= rule.max_claims) {
    return {
      status: "limit_reached",
      achievement,
      claimedCount: rule.claimed_count,
      maxClaims: rule.max_claims,
    };
  }

  try {
    await db.prepare(`INSERT INTO claim_records (event_id, achievement_id, device_hash)
      VALUES (?, ?, ?)`)
      .bind(eventId, rule.achievement_id, deviceHash)
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE")) {
      return { status: "already", achievement, claimedCount: rule.claimed_count, maxClaims: rule.max_claims };
    }
    if (message.includes("claim_limit_reached")) {
      return { status: "limit_reached", achievement, claimedCount: rule.max_claims, maxClaims: rule.max_claims };
    }
    if (message.includes("event_closed")) return { status: "event_closed", achievement };
    if (message.includes("achievement_disabled")) return { status: "achievement_disabled", achievement };
    throw error;
  }

  const updated = await db.prepare(`SELECT claimed_count, max_claims FROM claim_rules
      WHERE event_id = ? AND achievement_id = ?`)
    .bind(eventId, rule.achievement_id)
    .first<{ claimed_count: number; max_claims: number }>();
  return {
    status: "claimed",
    achievement,
    claimedCount: updated?.claimed_count ?? rule.claimed_count + 1,
    maxClaims: updated?.max_claims ?? rule.max_claims,
  };
}

export async function resetClaimCount(eventId: string, achievementId: string) {
  await ensureClaimSchema();
  const db = getD1();
  await db.batch([
    db.prepare("DELETE FROM claim_records WHERE event_id = ? AND achievement_id = ?")
      .bind(eventId, achievementId),
    db.prepare(`UPDATE claim_rules SET claimed_count = 0, updated_at = CURRENT_TIMESTAMP
      WHERE event_id = ? AND achievement_id = ?`)
      .bind(eventId, achievementId),
  ]);
}
