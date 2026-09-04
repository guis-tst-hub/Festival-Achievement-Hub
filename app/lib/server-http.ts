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

function firstForwardedValue(value: string | null) {
  const first = value?.split(",", 1)[0]?.trim();
  return first || undefined;
}

function getExpectedOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  if (process.env.TRUST_PROXY_HEADERS !== "true") {
    return requestUrl.origin;
  }

  const protocol = firstForwardedValue(request.headers.get("x-forwarded-proto")) ?? requestUrl.protocol.slice(0, -1);
  const host = firstForwardedValue(request.headers.get("x-forwarded-host")) ?? request.headers.get("host")?.trim() ?? requestUrl.host;

  if ((protocol !== "http" && protocol !== "https") || !host || /[\s/?#@]/.test(host)) {
    throw new HttpError(403, "invalid reverse proxy headers");
  }

  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    throw new HttpError(403, "invalid reverse proxy headers");
  }
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if ((origin && origin !== getExpectedOrigin(request)) || site === "cross-site") {
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
