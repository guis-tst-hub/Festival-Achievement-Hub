import assert from "node:assert/strict";
import test from "node:test";
import { getClaimIdentity } from "../app/lib/claim-identity";
import { festivalConfigSchema } from "../app/lib/validation";
import { defaultFestivalConfig } from "../app/lib/demo-store";
import { toPublicFestivalConfig } from "../db/claims";
import { HttpError, requireSameOrigin } from "../app/lib/server-http";

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
  const previousSecret = process.env.CLAIM_DEVICE_SECRET;
  const previousProxy = process.env.TRUST_PROXY_HEADERS;
  process.env.CLAIM_DEVICE_SECRET = "test-secret-that-is-at-least-thirty-two-characters";
  delete process.env.TRUST_PROXY_HEADERS;
  try {
    const first = await getClaimIdentity(new Request("https://example.test/api/claims"));
    assert.ok(first.setCookie?.includes("HttpOnly"));
    assert.ok(first.setCookie?.includes("Secure"));
    const cookie = first.setCookie!.split(";")[0];
    const second = await getClaimIdentity(new Request("https://example.test/api/claims", { headers: { cookie } }));
    assert.equal(second.deviceId, first.deviceId);
    assert.equal(second.setCookie, undefined);
  } finally {
    if (previousSecret === undefined) delete process.env.CLAIM_DEVICE_SECRET;
    else process.env.CLAIM_DEVICE_SECRET = previousSecret;
    if (previousProxy === undefined) delete process.env.TRUST_PROXY_HEADERS;
    else process.env.TRUST_PROXY_HEADERS = previousProxy;
  }
});

test("client address headers are used only behind a trusted proxy", async () => {
  const previousSecret = process.env.CLAIM_DEVICE_SECRET;
  const previousProxy = process.env.TRUST_PROXY_HEADERS;
  process.env.CLAIM_DEVICE_SECRET = "test-secret-that-is-at-least-thirty-two-characters";
  const request = new Request("http://app:3000/api/claims", {
    headers: {
      "x-forwarded-for": "192.0.2.10, 192.0.2.20",
      "x-forwarded-proto": "https",
    },
  });

  try {
    delete process.env.TRUST_PROXY_HEADERS;
    const direct = await getClaimIdentity(request);
    assert.equal(direct.addressRateKey, undefined);
    assert.ok(!direct.setCookie?.includes("; Secure"));

    process.env.TRUST_PROXY_HEADERS = "true";
    const proxied = await getClaimIdentity(request);
    assert.ok(proxied.addressRateKey);
    assert.ok(proxied.setCookie?.includes("; Secure"));
  } finally {
    if (previousSecret === undefined) delete process.env.CLAIM_DEVICE_SECRET;
    else process.env.CLAIM_DEVICE_SECRET = previousSecret;
    if (previousProxy === undefined) delete process.env.TRUST_PROXY_HEADERS;
    else process.env.TRUST_PROXY_HEADERS = previousProxy;
  }
});

test("same-origin protection accepts a matching direct request", () => {
  const request = new Request("http://127.0.0.1:3000/api/admin/festivals", {
    headers: {
      origin: "http://127.0.0.1:3000",
      "sec-fetch-site": "same-origin",
    },
  });

  assert.doesNotThrow(() => requireSameOrigin(request));
});

test("same-origin protection uses the public Host behind a Docker port mapping", () => {
  const previous = process.env.TRUST_PROXY_HEADERS;
  delete process.env.TRUST_PROXY_HEADERS;

  try {
    const matching = new Request("http://127.0.0.1:3000/api/admin/festivals", {
      headers: {
        host: "192.168.123.28:3001",
        origin: "http://192.168.123.28:3001",
        "sec-fetch-site": "same-origin",
      },
    });
    const mismatched = new Request("http://127.0.0.1:3000/api/admin/festivals", {
      headers: {
        host: "192.168.123.28:3001",
        origin: "http://attacker.example",
        "sec-fetch-site": "same-origin",
      },
    });

    assert.doesNotThrow(() => requireSameOrigin(matching));
    assert.throws(
      () => requireSameOrigin(mismatched),
      (error: unknown) => error instanceof HttpError && error.status === 403,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.TRUST_PROXY_HEADERS;
    } else {
      process.env.TRUST_PROXY_HEADERS = previous;
    }
  }
});

test("forwarded origin is trusted only when the reverse-proxy boundary is enabled", () => {
  const previous = process.env.TRUST_PROXY_HEADERS;
  const request = new Request("http://app:3000/api/admin/festivals", {
    headers: {
      host: "app:3000",
      origin: "https://festival.example.edu",
      "sec-fetch-site": "same-origin",
      "x-forwarded-host": "festival.example.edu",
      "x-forwarded-proto": "https",
    },
  });

  try {
    delete process.env.TRUST_PROXY_HEADERS;
    assert.throws(
      () => requireSameOrigin(request),
      (error: unknown) => error instanceof HttpError && error.status === 403,
    );

    process.env.TRUST_PROXY_HEADERS = "true";
    assert.doesNotThrow(() => requireSameOrigin(request));
  } finally {
    if (previous === undefined) {
      delete process.env.TRUST_PROXY_HEADERS;
    } else {
      process.env.TRUST_PROXY_HEADERS = previous;
    }
  }
});

test("trusted proxy mode still rejects cross-site and malformed forwarded requests", () => {
  const previous = process.env.TRUST_PROXY_HEADERS;
  process.env.TRUST_PROXY_HEADERS = "true";

  try {
    const crossSite = new Request("http://app:3000/api/admin/festivals", {
      headers: {
        origin: "https://festival.example.edu",
        "sec-fetch-site": "cross-site",
        "x-forwarded-host": "festival.example.edu",
        "x-forwarded-proto": "https",
      },
    });
    const malformed = new Request("http://app:3000/api/admin/festivals", {
      headers: {
        origin: "https://festival.example.edu",
        "sec-fetch-site": "same-origin",
        "x-forwarded-host": "festival.example.edu",
        "x-forwarded-proto": "javascript",
      },
    });

    assert.throws(
      () => requireSameOrigin(crossSite),
      (error: unknown) => error instanceof HttpError && error.status === 403,
    );
    assert.throws(
      () => requireSameOrigin(malformed),
      (error: unknown) => error instanceof HttpError && error.status === 403,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.TRUST_PROXY_HEADERS;
    } else {
      process.env.TRUST_PROXY_HEADERS = previous;
    }
  }
});
