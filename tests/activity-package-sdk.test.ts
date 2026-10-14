import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadSdk() {
  const sent: Array<{ source: string; type: string; requestId: string; method: string; params?: unknown }> = [];
  const intervals = new Set<() => void>();
  const timeouts = new Set<() => void>();
  let receive: (event: { source: unknown; data: unknown }) => void;
  const parent = { postMessage: (message: typeof sent[number]) => sent.push(message) };
  const window = {
    parent,
    setInterval: (callback: () => void) => { intervals.add(callback); return callback; },
    clearInterval: (callback: () => void) => intervals.delete(callback),
    setTimeout: (callback: () => void) => { timeouts.add(callback); return callback; },
    clearTimeout: (callback: () => void) => timeouts.delete(callback),
    addEventListener: (_name: string, callback: typeof receive) => { receive = callback; },
    NCPAActivity: undefined as unknown as {
      getContext: (options?: unknown) => Promise<{ claim: unknown }>;
      onClaimStateChange: (listener: (state: unknown) => void) => () => void;
      dismissClaim: () => Promise<boolean>;
    },
  };
  vm.runInNewContext(readFileSync(new URL("../public/activity-package-sdk.js", import.meta.url), "utf8"), { window });
  return {
    sdk: window.NCPAActivity, sent, intervals, timeouts,
    deliver(data: unknown, source: unknown = parent) { receive({ source, data }); },
  };
}

test("claim subscriptions receive pending and all result kinds only from the parent, and can unsubscribe", () => {
  const host = loadSdk();
  const states: unknown[] = [];
  const unsubscribe = host.sdk.onClaimStateChange(state => states.push(state));
  const pending = { pending: true, result: null };
  host.deliver({ source: "ncpa-activity-host", type: "claimStateChanged", value: pending }, {});
  assert.equal(states.length, 0);
  host.deliver({ source: "other-host", type: "claimStateChanged", value: pending });
  assert.equal(states.length, 0);
  host.deliver({ source: "ncpa-activity-host", type: "claimStateChanged", value: pending });
  assert.equal(states[0], pending);
  for (const kind of ["success", "already", "error"]) {
    const result = { pending: false, result: { kind, title: "扫码结果", message: "结果说明" } };
    host.deliver({ source: "ncpa-activity-host", type: "claimStateChanged", value: result });
    assert.equal(states.at(-1), result);
  }
  unsubscribe();
  host.deliver({ source: "ncpa-activity-host", type: "claimStateChanged", value: { pending: false, result: null } });
  assert.equal(states.length, 4);
});

test("initial context retains a claim completed before package connection and rejects forged responses", async () => {
  const host = loadSdk();
  const response = host.sdk.getContext({ themedClaims: true });
  const request = host.sent[0];
  assert.equal(request.method, "getContext");
  assert.equal((request.params as { themedClaims: boolean }).themedClaims, true);
  const snapshot = { claim: { pending: false, result: { kind: "success", title: "新成就已解锁" } } };
  const message = { source: "ncpa-activity-host", type: "response", requestId: request.requestId, ok: true, value: snapshot };
  host.deliver(message, {});
  assert.equal(host.timeouts.size, 1);
  host.deliver(message);
  assert.equal(await response, snapshot);
  assert.equal(host.timeouts.size, 0);
  assert.equal(host.intervals.size, 0);
});

test("dismissing a claim sends one request, clears timers, and propagates pending-claim rejection", async () => {
  const host = loadSdk();
  const dismissed = host.sdk.dismissClaim();
  assert.equal(host.sent[0].method, "dismissClaim");
  assert.equal(host.intervals.size, 0);
  host.deliver({ source: "ncpa-activity-host", type: "response", requestId: host.sent[0].requestId, ok: true, value: true });
  assert.equal(await dismissed, true);
  assert.equal(host.timeouts.size, 0);
  const rejected = host.sdk.dismissClaim();
  host.deliver({ source: "ncpa-activity-host", type: "response", requestId: host.sent[1].requestId, ok: false, error: "二维码仍在验证中" });
  await assert.rejects(rejected, /二维码仍在验证中/);
});
