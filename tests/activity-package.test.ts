import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { parseActivityPackage } from "../app/lib/activity-package";
import { defaultFestivalConfig } from "../app/lib/demo-store";

async function makePackage(options: { manifestEventId?: string; configEventId?: string; unsafePath?: string } = {}) {
  const zip = new JSZip();
  const manifestEventId = options.manifestEventId ?? "test-package-2026";
  const configEventId = options.configEventId ?? manifestEventId;
  zip.file("manifest.json", JSON.stringify({
    eventId: manifestEventId,
    name: "测试活动包",
    version: "1.0.0",
    entry: "index.html",
    sdkVersion: 1,
  }));
  zip.file("festival-config.json", JSON.stringify({ ...defaultFestivalConfig, eventId: configEventId }));
  zip.file("index.html", "<!doctype html><title>package</title>");
  zip.file("assets/theme.css", "body { color: cyan; }");
  if (options.unsafePath) zip.file(options.unsafePath, "unsafe");
  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
}

test("valid activity packages include manifest, configuration, entry and assets", async () => {
  const parsed = await parseActivityPackage(await makePackage());
  assert.equal(parsed.manifest.version, "1.0.0");
  assert.equal(parsed.config.eventId, "test-package-2026");
  assert.deepEqual(parsed.files.map((file) => file.path).sort(), [
    "assets/theme.css",
    "index.html",
  ]);
});

test("activity packages reject mismatched event identifiers", async () => {
  await assert.rejects(
    parseActivityPackage(await makePackage({ configEventId: "different-event" })),
    /eventId 不一致/,
  );
});

test("activity packages reject traversal paths even when ZIP readers sanitize them", async () => {
  await assert.rejects(
    parseActivityPackage(await makePackage({ unsafePath: "../outside.js" })),
    /不安全的文件路径/,
  );
});
