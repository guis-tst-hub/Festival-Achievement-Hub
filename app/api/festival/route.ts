import { loadActiveFestivalFromServer, loadFestivalConfigFromServer } from "../../../db/claims";

export async function GET(request: Request) {
  try {
    const eventId = new URL(request.url).searchParams.get("eventId")?.trim() ?? "";
    const config = eventId
      ? await loadFestivalConfigFromServer(eventId)
      : await loadActiveFestivalFromServer();
    if (!eventId && !config) return Response.json({ config: null });
    if (!config) return Response.json({ error: "event not found" }, { status: 404 });
    return Response.json({ config });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "festival lookup failed" },
      { status: 500 },
    );
  }
}
