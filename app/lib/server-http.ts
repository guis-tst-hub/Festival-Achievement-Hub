import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function readJson(request: Request, maxBytes = 512 * 1024): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpError(413, "request body is too large");
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maxBytes) {
    throw new HttpError(413, "request body is too large");
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new HttpError(400, "invalid JSON body");
  }
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if ((origin && origin !== new URL(request.url).origin) || site === "cross-site") {
    throw new HttpError(403, "cross-origin request rejected");
  }
}

export function apiError(error: unknown, fallback: string) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return Response.json({ error: "request validation failed", issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) }, { status: 400 });
  }
  console.error(JSON.stringify({ level: "error", message: fallback, error: error instanceof Error ? error.message : String(error) }));
  return Response.json({ error: fallback }, { status: 500 });
}
