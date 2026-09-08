import { z } from "zod";
import { createAdmin, deleteAdmin, listAdmins, requireAdminSession } from "../../../lib/admin-auth";
import { apiError, noStoreJson, readJson, requireSameOrigin } from "../../../lib/server-http";

const createSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(12).max(128),
}).strict();

export async function GET(request: Request) {
  try {
    const session = await requireAdminSession(request);
    return noStoreJson({ admins: await listAdmins(), canManageAdmins: session.principal.role === "superadmin" });
  } catch (error) {
    return apiError(error, "administrator list lookup failed");
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const session = await requireAdminSession(request, { csrf: true, superadmin: true });
    const input = createSchema.parse(await readJson(request, 8 * 1024));
    return noStoreJson({ admin: await createAdmin(session.principal, input.username, input.password) }, { status: 201 });
  } catch (error) {
    return apiError(error, "administrator creation failed");
  }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    const session = await requireAdminSession(request, { csrf: true, superadmin: true });
    const username = new URL(request.url).searchParams.get("username") ?? "";
    await deleteAdmin(session.principal, username);
    return noStoreJson({ removed: true });
  } catch (error) {
    return apiError(error, "administrator deletion failed");
  }
}
