import { apiError, noStoreJson } from "../../lib/server-http";
import { loadActiveFestivalFromServer, loadFestivalConfigFromServer, toPublicFestivalConfig } from "../../../db/claims";
import { getMaintenanceState } from "../../lib/system-settings";

export async function GET(request: Request) {
  try {
    const maintenance = await getMaintenanceState();
    if (maintenance.active) return noStoreJson({ config: null, maintenance });
    const eventId = new URL(request.url).searchParams.get("eventId")?.trim() ?? "";
    if (eventId && !/^[a-z0-9][a-z0-9-]{2,63}$/.test(eventId)) {
      return noStoreJson({ code: "EVENT_ID_INVALID", error: "invalid eventId" }, { status: 400 });
    }
    const config = eventId ? await loadFestivalConfigFromServer(eventId) : await loadActiveFestivalFromServer();
    if (!eventId && !config) return noStoreJson({ config: null, maintenance });
    if (!config) return noStoreJson({ code: "EVENT_NOT_FOUND", error: "event not found" }, { status: 404 });
    return noStoreJson({ config: toPublicFestivalConfig(config), maintenance });
  } catch (error) {
    return apiError(error, "festival lookup failed");
  }
}
