CREATE TABLE IF NOT EXISTS "admins" (
  "id" serial PRIMARY KEY NOT NULL,
  "username" text NOT NULL,
  "password_hash" text NOT NULL,
  "role" text DEFAULT 'admin' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_by" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "last_login_at" timestamptz,
  CONSTRAINT "admins_role_check" CHECK ("role" IN ('superadmin', 'admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_admins_username" ON "admins" ("username");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_sessions" (
  "token_hash" text PRIMARY KEY NOT NULL,
  "csrf_token_hash" text NOT NULL,
  "admin_id" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "last_seen_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "admin_sessions_admin_id_admins_id_fk"
    FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_sessions_expires_at" ON "admin_sessions" ("expires_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_login_attempts" (
  "rate_key" text PRIMARY KEY NOT NULL,
  "window_started_at" timestamptz DEFAULT now() NOT NULL,
  "attempt_count" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "admin_login_attempts_count_check" CHECK ("attempt_count" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "actor_username" text,
  "action" text NOT NULL,
  "target" text,
  "detail_json" text DEFAULT '{}' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_audit_logs_created_at" ON "admin_audit_logs" ("created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value_json" text NOT NULL,
  "updated_by" text,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "app_settings" ("key", "value_json") VALUES (
  'maintenance',
  '{"active":false,"message":"系统正在维护，请稍后再试。","startedAt":null,"startedBy":null}'
) ON CONFLICT ("key") DO NOTHING;
