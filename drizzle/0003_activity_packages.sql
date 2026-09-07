CREATE TABLE IF NOT EXISTS "activity_packages" (
  "event_id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "version" text NOT NULL,
  "entry_path" text NOT NULL,
  "manifest_json" text NOT NULL,
  "file_count" integer NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "activity_packages_event_id_claim_events_event_id_fk"
    FOREIGN KEY ("event_id") REFERENCES "claim_events"("event_id") ON DELETE CASCADE,
  CONSTRAINT "activity_packages_file_count_check" CHECK ("file_count" BETWEEN 1 AND 128)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_package_files" (
  "event_id" text NOT NULL,
  "path" text NOT NULL,
  "mime_type" text NOT NULL,
  "content" bytea NOT NULL,
  CONSTRAINT "activity_package_files_event_id_path_pk" PRIMARY KEY("event_id", "path"),
  CONSTRAINT "activity_package_files_event_id_activity_packages_event_id_fk"
    FOREIGN KEY ("event_id") REFERENCES "activity_packages"("event_id") ON DELETE CASCADE
);
