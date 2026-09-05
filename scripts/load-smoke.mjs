#!/usr/bin/env node

const baseUrl = new URL(process.argv[2] ?? "http://127.0.0.1:3001");
const totalRequests = Number.parseInt(process.argv[3] ?? "500", 10);
const concurrency = Number.parseInt(process.argv[4] ?? "25", 10);

if (!Number.isInteger(totalRequests) || totalRequests < 1 || totalRequests > 100_000) {
  throw new Error("total requests must be between 1 and 100000");
}
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 200) {
  throw new Error("concurrency must be between 1 and 200");
}

const endpoints = ["/api/health", "/api/festival"];
const durations = [];
const failures = [];
let nextRequest = 0;

async function requestOnce(index) {
  const path = endpoints[index % endpoints.length];
  const startedAt = performance.now();
  try {
    const response = await fetch(new URL(path, baseUrl), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    await response.arrayBuffer();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    durations.push(performance.now() - startedAt);
  }
}

async function worker() {
  while (true) {
    const index = nextRequest++;
    if (index >= totalRequests) return;
    await requestOnce(index);
  }
}

const startedAt = performance.now();
await Promise.all(Array.from({ length: Math.min(concurrency, totalRequests) }, () => worker()));
const elapsedMs = performance.now() - startedAt;
durations.sort((left, right) => left - right);
const percentile = (value) => durations[Math.min(durations.length - 1, Math.ceil(durations.length * value) - 1)] ?? 0;

console.log(JSON.stringify({
  baseUrl: baseUrl.origin,
  totalRequests,
  concurrency,
  failures: failures.length,
  requestsPerSecond: Number((totalRequests / (elapsedMs / 1000)).toFixed(1)),
  p50Ms: Number(percentile(0.5).toFixed(1)),
  p95Ms: Number(percentile(0.95).toFixed(1)),
  p99Ms: Number(percentile(0.99).toFixed(1)),
}, null, 2));

if (failures.length > 0) {
  console.error(failures.slice(0, 10).join("\n"));
  process.exitCode = 1;
}
