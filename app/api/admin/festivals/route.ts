import {
  createFestival,
  FestivalAlreadyExistsError,
  listFestivals,
  type NewFestivalInput,
} from "../../../../db/claims";

export async function GET() {
  try {
    return Response.json({ festivals: await listFestivals() });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "festival list lookup failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const input = await request.json() as NewFestivalInput;
    const config = await createFestival(input);
    return Response.json({ config }, { status: 201 });
  } catch (error) {
    if (error instanceof FestivalAlreadyExistsError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof TypeError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "festival creation failed" },
      { status: 500 },
    );
  }
}
