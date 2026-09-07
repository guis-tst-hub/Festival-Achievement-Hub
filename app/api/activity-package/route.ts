import { getActivityPackageSummary } from "../../../db/activity-packages";
import { apiError, noStoreJson } from "../../lib/server-http";

export async function GET(request: Request) {
  try {
    const eventId = new URL(request.url).searchParams.get("eventId")?.trim() ?? "";
    if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(eventId)) {
      return noStoreJson({ code: "EVENT_ID_INVALID", error: "invalid eventId" }, { status: 400 });
    }
    const activityPackage = await getActivityPackageSummary(eventId);
    return noStoreJson({
      available: Boolean(activityPackage),
      entryUrl: activityPackage
        ? `/activity-packages/${encodeURIComponent(eventId)}/${activityPackage.entry.split("/").map(encodeURIComponent).join("/")}?v=${encodeURIComponent(activityPackage.updatedAt)}`
        : null,
      package: activityPackage,
    });
  } catch (error) {
    return apiError(error, "activity package lookup failed");
  }
}
