import { getClaimStats } from "../../../../db/claims";
import {
  ActivityPackageEventNotFoundError,
  deleteActivityPackage,
  getActivityPackageSummary,
  importActivityPackage,
} from "../../../../db/activity-packages";
import { MAX_PACKAGE_BYTES, parseActivityPackage } from "../../../lib/activity-package";
import { apiError, HttpError, noStoreJson, requireSameOrigin } from "../../../lib/server-http";
import { requireAdminSession } from "../../../lib/admin-auth";

const eventIdPattern = /^[a-z0-9][a-z0-9-]{2,63}$/;

function readEventId(request: Request) {
  const eventId = new URL(request.url).searchParams.get("eventId")?.trim() ?? "";
  if (!eventIdPattern.test(eventId)) throw new HttpError(400, "invalid eventId", "EVENT_ID_INVALID");
  return eventId;
}

export async function GET(request: Request) {
  try {
    await requireAdminSession(request);
    const eventId = readEventId(request);
    return noStoreJson({ package: await getActivityPackageSummary(eventId) });
  } catch (error) {
    return apiError(error, "activity package lookup failed");
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await requireAdminSession(request, { csrf: true });
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PACKAGE_BYTES + 1024 * 1024) {
      throw new HttpError(413, "activity package is too large", "PAYLOAD_TOO_LARGE");
    }

    const form = await request.formData();
    const eventIdValue = form.get("eventId");
    const packageValue = form.get("package");
    const eventId = typeof eventIdValue === "string" ? eventIdValue.trim() : "";
    if (!eventIdPattern.test(eventId)) throw new HttpError(400, "invalid eventId", "EVENT_ID_INVALID");
    if (!packageValue || typeof packageValue === "string") {
      throw new HttpError(400, "missing ZIP activity package", "PACKAGE_MISSING");
    }
    if (!packageValue.name.toLowerCase().endsWith(".zip")) {
      throw new HttpError(400, "activity package must be a ZIP file", "PACKAGE_INVALID");
    }

    const bytes = new Uint8Array(await packageValue.arrayBuffer());
    const parsed = await parseActivityPackage(bytes);
    const result = await importActivityPackage(eventId, parsed.manifest, parsed.config, parsed.files);
    return noStoreJson({ ...result, stats: await getClaimStats(eventId) });
  } catch (error) {
    if (error instanceof ActivityPackageEventNotFoundError) {
      return noStoreJson({ code: "EVENT_NOT_FOUND", error: error.message }, { status: 404 });
    }
    return apiError(error, "activity package import failed");
  }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    await requireAdminSession(request, { csrf: true });
    const eventId = readEventId(request);
    const removed = await deleteActivityPackage(eventId);
    if (!removed) return noStoreJson({ code: "PACKAGE_NOT_FOUND", error: "activity package not found" }, { status: 404 });
    return noStoreJson({ removed: true });
  } catch (error) {
    return apiError(error, "activity package removal failed");
  }
}
