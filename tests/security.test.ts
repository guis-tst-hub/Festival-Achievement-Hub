import assert from "node:assert/strict";
import test from "node:test";
import { getClaimIdentity } from "../app/lib/claim-identity";
import { festivalConfigSchema } from "../app/lib/validation";
import { defaultFestivalConfig } from "../app/lib/demo-store";
import { toPublicFestivalConfig } from "../db/claims";

test("public festival configuration does not expose claim codes", () => {
  const publicConfig = toPublicFestivalConfig(defaultFestivalConfig);
  assert.ok(publicConfig.achievements.length > 0);
  assert.ok(publicConfig.achievements.every((achievement) => achievement.claimCode === ""));
  assert.doesNotMatch(JSON.stringify(publicConfig), /demo-1/);
});

test("festival validation rejects duplicate claim codes and unknown categories", () => {
  const invalid = structuredClone(defaultFestivalConfig);
  invalid.achievements[1].claimCode = invalid.achievements[0].claimCode;
  invalid.achievements[1].categoryId = "missing";
  assert.equal(festivalConfigSchema.safeParse(invalid).success, false);
});

test("claim identity is server-signed and stable", async () => {
  process.env.CLAIM_DEVICE_SECRET = "test-secret-that-is-at-least-thirty-two-characters";
  const first = await getClaimIdentity(new Request("https://example.test/api/claims"));
  assert.ok(first.setCookie?.includes("HttpOnly"));
  assert.ok(first.setCookie?.includes("Secure"));
  const cookie = first.setCookie!.split(";")[0];
  const second = await getClaimIdentity(new Request("https://example.test/api/claims", { headers: { cookie } }));
  assert.equal(second.deviceId, first.deviceId);
  assert.equal(second.setCookie, undefined);
});
