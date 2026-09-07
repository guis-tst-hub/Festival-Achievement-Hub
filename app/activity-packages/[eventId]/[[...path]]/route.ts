import { getActivityPackageFile } from "../../../../db/activity-packages";
import { isSafePackagePath } from "../../../lib/activity-package";

type RouteContext = { params: Promise<{ eventId: string; path?: string[] }> };

const packageContentSecurityPolicy = [
  "sandbox allow-scripts",
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export async function GET(_request: Request, context: RouteContext) {
  const { eventId, path: pathSegments } = await context.params;
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(eventId)) return new Response("Not found", { status: 404 });
  const requestedPath = pathSegments?.join("/");
  if (requestedPath && !isSafePackagePath(requestedPath)) return new Response("Not found", { status: 404 });

  const file = await getActivityPackageFile(eventId, requestedPath);
  if (!file) return new Response("Not found", { status: 404 });

  return new Response(file.content as BodyInit, {
    headers: {
      "Cache-Control": "no-store, max-age=0, must-revalidate",
      "Content-Security-Policy": packageContentSecurityPolicy,
      "Content-Type": file.mimeType,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
