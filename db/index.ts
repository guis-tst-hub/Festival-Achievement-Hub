import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDatabase = globalThis as typeof globalThis & {
  festivalSql?: ReturnType<typeof postgres>;
};

export function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

  if (!globalForDatabase.festivalSql) {
    const max = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "10", 10);
    globalForDatabase.festivalSql = postgres(databaseUrl, {
      max: Number.isFinite(max) && max > 0 ? max : 10,
      connect_timeout: 10,
      idle_timeout: 20,
    });
  }
  return globalForDatabase.festivalSql;
}

export function getDb() {
  return drizzle(getSql(), { schema });
}
