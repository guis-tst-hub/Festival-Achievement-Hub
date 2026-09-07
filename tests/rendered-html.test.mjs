import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";

const port = 3100 + (process.pid % 500);
let server;

before(async () => {
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
    env: { ...process.env, ADMIN_USERNAME: "test-admin", ADMIN_PASSWORD: "test-password-with-32-characters" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Next.js test server timed out")), 20_000);
    server.once("exit", (code) => reject(new Error(`Next.js exited with ${code}`)));
    server.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Ready")) { clearTimeout(timeout); resolve(); }
    });
  });
});

after(() => server?.kill("SIGTERM"));

test("renders the generic idle mobile experience", async () => {
  const response = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /活动未开始/);
  assert.doesNotMatch(html, /管理员入口/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
});

test("protects admin pages and APIs and renders with credentials", async () => {
  assert.equal((await fetch(`http://127.0.0.1:${port}/admin`)).status, 401);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/admin/festivals`)).status, 401);
  const authorization = `Basic ${Buffer.from("test-admin:test-password-with-32-characters").toString("base64")}`;
  const response = await fetch(`http://127.0.0.1:${port}/admin`, { headers: { authorization } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.match(await response.text(), /活动列表/);
});
