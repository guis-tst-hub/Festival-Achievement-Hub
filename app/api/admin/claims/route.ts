import { apiError, readJson, requireSameOrigin } from "../../../lib/server-http";
import { adminActionSchema } from "../../../lib/validation";
import { getClaimStats, loadFestivalConfigFromServer, resetClaimCount, syncFestivalConfig } from "../../../../db/claims";

export async function GET(request: Request) {
  try {
    const eventId = new URL(request.url).searchParams.get("eventId")?.trim() ?? "";
    if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(eventId)) {
      return Response.json({ error: "invalid eventId" }, { status: 400 });
    }
    const config = await loadFestivalConfigFromServer(eventId);
    if (!config) return Response.json({ error: "event not found" }, { status: 404 });
    return Response.json({ config, stats: await getClaimStats(eventId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "admin state lookup failed");
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const payload = adminActionSchema.parse(await readJson(request));
    if (payload.action === "sync") {
      const config = await syncFestivalConfig(payload.config);
      return Response.json({ config, stats: await getClaimStats(config.eventId) });
    }
    await resetClaimCount(payload.eventId, payload.achievementId);
    return Response.json({ stats: await getClaimStats(payload.eventId) });
  } catch (error) {
    return apiError(error, "admin claim action failed");
  }
}
