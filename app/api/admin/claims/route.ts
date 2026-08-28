import { getClaimStats, resetClaimCount, syncFestivalConfig } from "../../../../db/claims";
import type { FestivalConfig } from "../../../lib/demo-store";

export async function GET(request: Request) {
  try {
    const eventId = new URL(request.url).searchParams.get("eventId")?.trim() ?? "";
    if (!eventId) return Response.json({ error: "eventId is required" }, { status: 400 });
    return Response.json({ stats: await getClaimStats(eventId) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "stats lookup failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as {
      action?: "sync" | "reset";
      config?: FestivalConfig;
      eventId?: string;
      achievementId?: string;
    };
    if (payload.action === "sync" && payload.config) {
      const config = await syncFestivalConfig(payload.config);
      return Response.json({ config, stats: await getClaimStats(config.eventId) });
    }
    if (payload.action === "reset" && payload.eventId && payload.achievementId) {
      await resetClaimCount(payload.eventId, payload.achievementId);
      return Response.json({ stats: await getClaimStats(payload.eventId) });
    }
    return Response.json({ error: "invalid admin action" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "admin claim action failed" },
      { status: 500 },
    );
  }
}
