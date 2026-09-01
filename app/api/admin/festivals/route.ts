import { ZodError } from "zod";
import { apiError, readJson, requireSameOrigin } from "../../../lib/server-http";
import { newFestivalSchema } from "../../../lib/validation";
import { createFestival, FestivalAlreadyExistsError, listFestivals } from "../../../../db/claims";

export async function GET() {
  try {
    return Response.json({ festivals: await listFestivals() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "festival list lookup failed");
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const input = newFestivalSchema.parse(await readJson(request, 16 * 1024));
    const config = await createFestival(input);
    return Response.json({ config }, { status: 201 });
  } catch (error) {
    if (error instanceof FestivalAlreadyExistsError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof ZodError) {
      return Response.json({ error: "request validation failed" }, { status: 400 });
    }
    return apiError(error, "festival creation failed");
  }
}
