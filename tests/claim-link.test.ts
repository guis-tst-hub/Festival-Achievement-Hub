import assert from "node:assert/strict";
import test from "node:test";
import { clearClaimParameters, parseClaimPayload } from "../app/lib/claim-link";

test("direct claim links work over both HTTP and HTTPS", () => {
  const expected = { eventId: "festival-2026", claimCode: "wall-code-01" };
  assert.deepEqual(
    parseClaimPayload("http://192.168.1.8/?event=festival-2026&unlock=wall-code-01", "http://192.168.1.8", "fallback-event"),
    expected,
  );
  assert.deepEqual(
    parseClaimPayload("https://festival.example/?event=festival-2026&unlock=wall-code-01", "https://festival.example", "fallback-event"),
    expected,
  );
});

test("the in-page scanner accepts a plain code for the active event", () => {
  assert.deepEqual(
    parseClaimPayload("wall-code-01", "https://festival.example", "festival-2026"),
    { eventId: "festival-2026", claimCode: "wall-code-01" },
  );
});

test("claim links reject missing identifiers and unsafe protocols", () => {
  assert.throws(
    () => parseClaimPayload("https://festival.example/?event=festival-2026", "https://festival.example", "festival-2026"),
    /成就识别码/,
  );
  assert.throws(
    () => parseClaimPayload("javascript:?event=festival-2026&unlock=wall-code-01", "https://festival.example", "festival-2026"),
    /网页链接/,
  );
});

test("processed direct links keep unrelated query parameters", () => {
  assert.equal(
    clearClaimParameters("https://festival.example/?event=festival-2026&unlock=wall-code-01&source=poster#achievements"),
    "/?source=poster#achievements",
  );
});
