import { requireAdminSession, rotateAdminCsrf } from "../../../../lib/admin-auth";
import { apiError, noStoreJson } from "../../../../lib/server-http";

export async function GET(request: Request) {
  try {
    const session = await requireAdminSession(request);
    return noStoreJson({ user: session.principal, csrfToken: await rotateAdminCsrf(session) });
  } catch (error) {
    return apiError(error, "administrator session lookup failed");
  }
}
