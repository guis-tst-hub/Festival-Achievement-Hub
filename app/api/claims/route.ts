import { getClaimIdentity } from "../../lib/claim-identity";
import { apiError, noStoreJson, readJson } from "../../lib/server-http";
import { claimRequestSchema } from "../../lib/validation";
import { claimOnline, consumeClaimRateLimit } from "../../../db/claims";

export async function POST(request: Request) {
  try {
    const payload = claimRequestSchema.parse(await readJson(request, 8 * 1024));
    const identity = await getClaimIdentity(request);
    const deviceLimit = consumeClaimRateLimit(`device:${identity.deviceRateKey}`, 12, 60);
    const addressLimit = identity.addressRateKey
      ? consumeClaimRateLimit(`address:${identity.addressRateKey}`, 40, 60)
      : Promise.resolve(true);
    const [deviceAllowed, addressAllowed] = await Promise.all([deviceLimit, addressLimit]);
    if (!deviceAllowed || !addressAllowed) {
      return noStoreJson(
        { code: "RATE_LIMITED", error: "too many claim attempts" },
        { status: 429, headers: { "Retry-After": "60", ...(identity.setCookie ? { "Set-Cookie": identity.setCookie } : {}) } },
      );
    }

    const result = await claimOnline(payload.eventId, payload.claimCode, identity.deviceId);
    return noStoreJson(result, {
      status: result.status === "not_found" ? 404 : 200,
      headers: identity.setCookie ? { "Set-Cookie": identity.setCookie } : undefined,
    });
  } catch (error) {
    return apiError(error, "claim failed");
  }
}
