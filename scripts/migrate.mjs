import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not configured");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1, connect_timeout: 30 });
try {
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("Database migrations are up to date");
} finally {
  await sql.end();
}
