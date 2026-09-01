import { getSql } from "../../../db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getSql()`SELECT 1`;
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", message: "health check failed", error: error instanceof Error ? error.message : String(error) }));
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
