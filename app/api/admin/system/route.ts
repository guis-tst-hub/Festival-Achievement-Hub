import { z } from "zod";
import { logAdminAudit, requireAdminSession } from "../../../lib/admin-auth";
import { apiError, HttpError, noStoreJson, readJson, requireSameOrigin } from "../../../lib/server-http";
import { dispatchGitHubUpdate, getMaintenanceState, githubUpdateConfigured, setMaintenanceState } from "../../../lib/system-settings";

const systemActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setMaintenance"), active: z.boolean(), message: z.string().max(160).optional() }).strict(),
  z.object({ action: z.literal("dispatchUpdate") }).strict(),
]);

export async function GET(request: Request) {
  try {
    await requireAdminSession(request);
    return noStoreJson({ maintenance: await getMaintenanceState(), updateConfigured: githubUpdateConfigured() });
  } catch (error) {
    return apiError(error, "system status lookup failed");
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const session = await requireAdminSession(request, { csrf: true });
    const input = systemActionSchema.parse(await readJson(request, 8 * 1024));
    if (input.action === "setMaintenance") {
      const maintenance = await setMaintenanceState(input.active, session.principal.username, input.message);
      await logAdminAudit(session.principal.username, "maintenance.set", input.active ? "active" : "inactive", {});
      return noStoreJson({ maintenance, updateConfigured: githubUpdateConfigured() });
    }

    if (session.principal.role !== "superadmin") {
      throw new HttpError(403, "super administrator permission required", "SUPERADMIN_REQUIRED");
    }

    const maintenance = await setMaintenanceState(true, session.principal.username, "系统正在部署更新，请稍后再试。");
    try {
      await dispatchGitHubUpdate();
      await logAdminAudit(session.principal.username, "deployment.dispatch", process.env.GITHUB_UPDATE_REPOSITORY ?? null, {});
      return noStoreJson({ maintenance, updateConfigured: true, dispatched: true }, { status: 202 });
    } catch (error) {
      await setMaintenanceState(false, session.principal.username);
      throw error;
    }
  } catch (error) {
    return apiError(error, "system action failed");
  }
}
