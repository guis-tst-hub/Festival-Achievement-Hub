import { getClaimIdentity } from "../../lib/claim-identity";
import { apiError, readJson } from "../../lib/server-http";
import { claimRequestSchema } from "../../lib/validation";
import { claimOnline, consumeClaimRateLimit } from "../../../db/claims";

export async function POST(request: Request) {
  try {
    const payload = claimRequestSchema.parse(await readJson(request, 8 * 1024));
    const identity = await getClaimIdentity(request);
    const [deviceAllowed, addressAllowed] = await Promise.all([
      consumeClaimRateLimit(`device:${identity.deviceRateKey}`, 12, 60),
      consumeClaimRateLimit(`address:${identity.ipKey}`, 40, 60),
    ]);
    if (!deviceAllowed || !addressAllowed) {
      return Response.json(
        { error: "too many claim attempts" },
        { status: 429, headers: { "Retry-After": "60", ...(identity.setCookie ? { "Set-Cookie": identity.setCookie } : {}) } },
      );
    }

    const result = await claimOnline(payload.eventId, payload.claimCode, identity.deviceId);
    return Response.json(result, {
      status: result.status === "not_found" ? 404 : 200,
      headers: { "Cache-Control": "no-store", ...(identity.setCookie ? { "Set-Cookie": identity.setCookie } : {}) },
    });
  } catch (error) {
    return apiError(error, "claim failed");
  }
}
