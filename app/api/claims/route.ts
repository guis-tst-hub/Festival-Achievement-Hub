import { claimOnline } from "../../../db/claims";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as {
      eventId?: string;
      claimCode?: string;
      deviceId?: string;
    };
    const eventId = payload.eventId?.trim() ?? "";
    const claimCode = payload.claimCode?.trim() ?? "";
    const deviceId = payload.deviceId?.trim() ?? "";
    if (!/^[a-z0-9_-]{3,80}$/i.test(eventId) || !/^[a-z0-9_-]{3,120}$/i.test(claimCode)) {
      return Response.json({ error: "invalid eventId or claimCode" }, { status: 400 });
    }
    if (!/^[a-z0-9-]{8,128}$/i.test(deviceId)) {
      return Response.json({ error: "invalid deviceId" }, { status: 400 });
    }
    const result = await claimOnline(eventId, claimCode, deviceId);
    return Response.json(result, { status: result.status === "not_found" ? 404 : 200 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "claim failed" },
      { status: 500 },
    );
  }
}
