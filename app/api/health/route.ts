import { getSql } from "../../../db";
import { noStoreJson } from "../../lib/server-http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getSql()`SELECT 1`;
    return noStoreJson({ status: "ok" });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", message: "health check failed", error: error instanceof Error ? error.message : String(error) }));
    return noStoreJson({ code: "DATABASE_UNAVAILABLE", status: "unavailable" }, { status: 503 });
  }
}
