import { apiError, noStoreJson, readJson, requireSameOrigin } from "../../../lib/server-http";
import { newFestivalSchema } from "../../../lib/validation";
import { createFestival, FestivalAlreadyExistsError, listFestivals } from "../../../../db/claims";
import { requireAdminSession } from "../../../lib/admin-auth";

export async function GET(request: Request) {
  try {
    await requireAdminSession(request);
    return noStoreJson({ festivals: await listFestivals() });
  } catch (error) {
    return apiError(error, "festival list lookup failed");
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await requireAdminSession(request, { csrf: true });
    const input = newFestivalSchema.parse(await readJson(request, 16 * 1024));
    const config = await createFestival(input);
    return noStoreJson({ config }, { status: 201 });
  } catch (error) {
    if (error instanceof FestivalAlreadyExistsError) {
      return noStoreJson({ code: "EVENT_ALREADY_EXISTS", error: error.message }, { status: 409 });
    }
    return apiError(error, "festival creation failed");
  }
}
