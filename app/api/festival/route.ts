import { apiError } from "../../lib/server-http";
import { loadActiveFestivalFromServer, loadFestivalConfigFromServer, toPublicFestivalConfig } from "../../../db/claims";

export async function GET(request: Request) {
  try {
    const eventId = new URL(request.url).searchParams.get("eventId")?.trim() ?? "";
    if (eventId && !/^[a-z0-9][a-z0-9-]{2,63}$/.test(eventId)) {
      return Response.json({ error: "invalid eventId" }, { status: 400 });
    }
    const config = eventId ? await loadFestivalConfigFromServer(eventId) : await loadActiveFestivalFromServer();
    if (!eventId && !config) return Response.json({ config: null }, { headers: { "Cache-Control": "no-store" } });
    if (!config) return Response.json({ error: "event not found" }, { status: 404 });
    return Response.json({ config: toPublicFestivalConfig(config) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "festival lookup failed");
  }
}
