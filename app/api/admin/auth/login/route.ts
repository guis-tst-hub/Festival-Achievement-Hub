import { z } from "zod";
import { createAdminSessionCookie, loginAdmin } from "../../../../lib/admin-auth";
import { apiError, noStoreJson, readJson, requireSameOrigin } from "../../../../lib/server-http";

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
}).strict();

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const input = loginSchema.parse(await readJson(request, 8 * 1024));
    const session = await loginAdmin(request, input.username, input.password);
    return noStoreJson({ user: session.principal, csrfToken: session.csrfToken }, {
      headers: { "Set-Cookie": createAdminSessionCookie(session.token, request) },
    });
  } catch (error) {
    return apiError(error, "administrator login failed");
  }
}
