import assert from "node:assert/strict";
import test from "node:test";
import { AdminApiError, describeAdminError, readAdminJson } from "../app/lib/admin-api";
import { apiError, HttpError, noStoreJson } from "../app/lib/server-http";

test("admin API responses expose stable error codes", async () => {
  const response = apiError(
    new HttpError(403, "cross-origin request rejected", "CROSS_ORIGIN_REJECTED"),
    "admin request failed",
  );

  assert.equal(response.status, 403);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.deepEqual(await response.json(), {
    code: "CROSS_ORIGIN_REJECTED",
    error: "cross-origin request rejected",
  });
});

test("admin client distinguishes validation failures", async () => {
  const response = noStoreJson({
    code: "VALIDATION_FAILED",
    error: "request validation failed",
    issues: [{ path: "config.achievements.0.claimCode", message: "Invalid string" }],
  }, { status: 400 });

  await assert.rejects(
    () => readAdminJson(response),
    (error: unknown) => {
      assert.ok(error instanceof AdminApiError);
      assert.equal(error.code, "VALIDATION_FAILED");
      assert.match(describeAdminError(error, "保存"), /config\.achievements\.0\.claimCode/);
      return true;
    },
  );
});

test("admin client maps non-JSON authentication failures", async () => {
  const response = new Response("Authentication required", { status: 401 });

  await assert.rejects(
    () => readAdminJson(response),
    (error: unknown) => {
      assert.ok(error instanceof AdminApiError);
      assert.equal(error.code, "AUTH_REQUIRED");
      assert.match(describeAdminError(error, "保存"), /重新登录/);
      return true;
    },
  );
});

test("admin client reports network failures separately", () => {
  assert.match(describeAdminError(new TypeError("fetch failed"), "保存"), /^\[NETWORK_ERROR\]/);
});
