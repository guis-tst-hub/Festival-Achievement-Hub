import JSZip, { type JSZipObject } from "jszip";
import { z } from "zod";
import type { FestivalConfig } from "./demo-store";
import { festivalConfigSchema } from "./validation";
import { HttpError } from "./server-http";

export const MAX_PACKAGE_BYTES = 8 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 24 * 1024 * 1024;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 128;

const allowedExtensions = new Set([
  "css", "gif", "html", "ico", "jpeg", "jpg", "js", "json", "mjs", "mp3",
  "ogg", "png", "svg", "txt", "wav", "webmanifest", "webp", "woff", "woff2",
]);

const mimeTypes: Record<string, string> = {
  css: "text/css; charset=utf-8",
  gif: "image/gif",
  html: "text/html; charset=utf-8",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  png: "image/png",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  wav: "audio/wav",
  webmanifest: "application/manifest+json",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
};

export const activityPackageManifestSchema = z.object({
  eventId: z.string().trim().min(3).max(64).regex(/^[a-z0-9][a-z0-9-]{2,63}$/),
  name: z.string().trim().min(1).max(80),
  version: z.string().trim().min(1).max(40).regex(/^[a-z0-9][a-z0-9._-]*$/i),
  entry: z.string().trim().min(1).max(180),
  sdkVersion: z.literal(1),
}).strict();

export type ActivityPackageManifest = z.infer<typeof activityPackageManifestSchema>;
export type ActivityPackageFile = { path: string; mimeType: string; content: Uint8Array };
export type ParsedActivityPackage = {
  manifest: ActivityPackageManifest;
  config: FestivalConfig;
  files: ActivityPackageFile[];
};

type SizedZipObject = JSZipObject & {
  unsafeOriginalName?: string;
  _data?: { uncompressedSize?: number };
};

export function isSafePackagePath(path: string) {
  return path.length > 0
    && path.length <= 180
    && !path.startsWith("/")
    && !path.includes("\\")
    && !path.includes("\0")
    && path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function packageError(message: string, code = "PACKAGE_INVALID"): never {
  throw new HttpError(400, message, code);
}

function readJsonFile<T>(text: string, label: string, parse: (value: unknown) => T) {
  try {
    return parse(JSON.parse(text) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) packageError(`${label} 不是有效的 JSON`);
    throw error;
  }
}

export async function parseActivityPackage(bytes: Uint8Array): Promise<ParsedActivityPackage> {
  if (!bytes.byteLength || bytes.byteLength > MAX_PACKAGE_BYTES) {
    packageError("ZIP 活动包不能超过 8 MB", "PAYLOAD_TOO_LARGE");
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  } catch {
    packageError("无法读取 ZIP，文件可能已损坏");
  }

  const entries = Object.values(zip.files).filter((entry) => !entry.dir) as SizedZipObject[];
  if (!entries.length) packageError("活动包是空的");
  if (entries.length > MAX_FILES) packageError(`活动包文件数量不能超过 ${MAX_FILES}`, "PAYLOAD_TOO_LARGE");

  let declaredTotal = 0;
  for (const entry of entries) {
    const originalPath = entry.unsafeOriginalName ?? entry.name;
    if (!isSafePackagePath(originalPath) || originalPath !== entry.name) {
      packageError(`活动包包含不安全的文件路径：${originalPath}`);
    }
    const extension = entry.name.split(".").pop()?.toLowerCase() ?? "";
    if (!allowedExtensions.has(extension)) packageError(`不允许的文件类型：${entry.name}`);
    const declaredSize = entry._data?.uncompressedSize ?? 0;
    if (declaredSize > MAX_FILE_BYTES) packageError(`单个文件不能超过 8 MB：${entry.name}`, "PAYLOAD_TOO_LARGE");
    declaredTotal += declaredSize;
    if (declaredTotal > MAX_UNCOMPRESSED_BYTES) packageError("活动包解压后不能超过 24 MB", "PAYLOAD_TOO_LARGE");
  }

  const manifestEntry = zip.file("manifest.json");
  const configEntry = zip.file("festival-config.json");
  if (!manifestEntry) packageError("活动包根目录缺少 manifest.json");
  if (!configEntry) packageError("活动包根目录缺少 festival-config.json");

  const manifest = readJsonFile(
    await manifestEntry.async("string"),
    "manifest.json",
    (value) => activityPackageManifestSchema.parse(value),
  );
  if (!isSafePackagePath(manifest.entry) || !manifest.entry.toLowerCase().endsWith(".html")) {
    packageError("manifest.entry 必须指向包内的 HTML 文件");
  }
  if (!zip.file(manifest.entry)) packageError(`找不到入口页面：${manifest.entry}`);

  const config = readJsonFile(
    await configEntry.async("string"),
    "festival-config.json",
    (value) => festivalConfigSchema.parse(value) as FestivalConfig,
  );
  if (manifest.eventId !== config.eventId) packageError("manifest.json 与 festival-config.json 的 eventId 不一致");

  const files: ActivityPackageFile[] = [];
  let actualTotal = 0;
  for (const entry of entries) {
    const content = await entry.async("uint8array");
    actualTotal += content.byteLength;
    if (content.byteLength > MAX_FILE_BYTES || actualTotal > MAX_UNCOMPRESSED_BYTES) {
      packageError("活动包解压后的文件过大", "PAYLOAD_TOO_LARGE");
    }
    // Configuration contains private claim codes. It is imported into the
    // protected database model and must never be published as a static asset.
    if (entry.name === "manifest.json" || entry.name === "festival-config.json") continue;
    const extension = entry.name.split(".").pop()?.toLowerCase() ?? "";
    files.push({ path: entry.name, mimeType: mimeTypes[extension] ?? "application/octet-stream", content });
  }

  return { manifest, config, files };
}
