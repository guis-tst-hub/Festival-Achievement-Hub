import { ZodError } from "zod";
import { applyNoStoreHeaders } from "./cache-policy";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = "REQUEST_REJECTED") {
    super(message);
  }
}

export function noStoreJson(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: applyNoStoreHeaders(new Headers(init.headers)),
  });
}

export async function readJson(request: Request, maxBytes = 512 * 1024): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpError(413, "request body is too large", "PAYLOAD_TOO_LARGE");
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maxBytes) {
    throw new HttpError(413, "request body is too large", "PAYLOAD_TOO_LARGE");
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new HttpError(400, "invalid JSON body", "INVALID_JSON");
  }
}

function firstForwardedValue(value: string | null) {
  const first = value?.split(",", 1)[0]?.trim();
  return first || undefined;
}

function originFromAuthority(protocol: string, host: string, errorMessage: string) {
  if ((protocol !== "http" && protocol !== "https") || !host || /[\s/?#@]/.test(host)) {
    throw new HttpError(403, errorMessage, "INVALID_ORIGIN");
  }

  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    throw new HttpError(403, errorMessage, "INVALID_ORIGIN");
  }
}

function getExpectedOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  if (process.env.TRUST_PROXY_HEADERS !== "true") {
    // Next's standalone server can construct request.url from its internal
    // listener (for example 127.0.0.1:3000) even when Docker publishes the
    // application at another LAN address and port. The Host header is the
    // browser-facing request authority and is therefore the correct direct
    // deployment boundary for same-origin checks.
    const host = request.headers.get("host")?.trim() || requestUrl.host;
    return originFromAuthority(requestUrl.protocol.slice(0, -1), host, "invalid host header");
  }

  const protocol = firstForwardedValue(request.headers.get("x-forwarded-proto")) ?? requestUrl.protocol.slice(0, -1);
  const host = firstForwardedValue(request.headers.get("x-forwarded-host")) ?? request.headers.get("host")?.trim() ?? requestUrl.host;
  return originFromAuthority(protocol, host, "invalid reverse proxy headers");
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if ((origin && origin !== getExpectedOrigin(request)) || site === "cross-site") {
    throw new HttpError(403, "cross-origin request rejected", "CROSS_ORIGIN_REJECTED");
  }
}

export function apiError(error: unknown, fallback: string) {
  if (error instanceof HttpError) {
    return noStoreJson({ code: error.code, error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return noStoreJson({
      code: "VALIDATION_FAILED",
      error: "request validation failed",
      issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    }, { status: 400 });
  }
  console.error(JSON.stringify({ level: "error", message: fallback, error: error instanceof Error ? error.message : String(error) }));
  return noStoreJson({ code: "INTERNAL_ERROR", error: fallback }, { status: 500 });
}
