import { clearAdminSessionCookie, logoutAdmin, requireAdminSession } from "../../../../lib/admin-auth";
import { apiError, noStoreJson, requireSameOrigin } from "../../../../lib/server-http";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const session = await requireAdminSession(request, { csrf: true });
    await logoutAdmin(session);
    return noStoreJson({ loggedOut: true }, { headers: { "Set-Cookie": clearAdminSessionCookie(request) } });
  } catch (error) {
    return apiError(error, "administrator logout failed");
  }
}
